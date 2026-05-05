# Cours #2 — Le protocole de communication

> Lecture estimée : 25 min. Ouvre le code à côté.
>
> Ce document explique **comment** les octets voyagent entre le firmware et le backend : CCSDS Space Packet Protocol, PUS-C, CRC-16. Pour la partie C en elle-même, va voir [`COURS_C_FIRMWARE.md`](COURS_C_FIRMWARE.md).

---

## 1. Pourquoi un protocole binaire ?

Sur un vrai satellite, la liaison radio est **rare et chère** :
- **Bande passante** : quelques kbps en VHF/UHF amateur, 1-10 Mbps en bande X. Pas du gigabit.
- **Fenêtres de visibilité** : 5 à 15 minutes par passage au-dessus d'une station sol. Ratée = attendre 90 min.
- **Énergie** : émettre coûte cher en batterie. Chaque bit a un prix.

Un format texte type JSON gaspillerait 3-4× la place. Un format binaire **fixe-layout** te donne :
- Taille connue à la compilation.
- Décodage trivial : `lat = readInt32BE(buf, 3) / 1e7`.
- Pas de parser à embarquer (un parser JSON c'est 5-50 KB de code).

Apogée simule sur UDP local mais **respecte la même contrainte** : 40 octets pour un rapport HK complet.

---

## 2. Pourquoi CCSDS ?

**CCSDS** (Consultative Committee for Space Data Systems) est l'organisme qui standardise les protocoles spatiaux. Membres : NASA, ESA, JAXA, CNES, agences spatiales chinoise/russe/indienne. Leurs documents sont gratuits sur [ccsds.org](https://public.ccsds.org/Publications/AllPubs.aspx).

Le standard qu'on suit ici :
- **CCSDS 133.0-B-2** — Space Packet Protocol (le format de paquet)
- **ECSS-E-ST-70-41C** — PUS-C (le contenu standard à mettre dedans)

> **Pourquoi ce standard et pas un format maison ?**
> 1. **Interop** : si demain un autre satellite ou une autre station sol veut parler au tien, ils savent déjà parser tes paquets.
> 2. **Vendor support** : les SDR (radios logicielles) GNU Radio / GMSK / etc savent décoder le SPP nativement.
> 3. **Crédibilité** : sur un CV CubeSat, "implémenté CCSDS PUS-C" est un signal fort. "Inventé son propre format" est un signal d'alerte.
> 4. **Discipline** : suivre un standard t'empêche de bricoler un truc bancal sous pression.

---

## 3. Big-endian et sérialisation manuelle

### 3.1 Network byte order

Le réseau (et la quasi-totalité des protocoles spatiaux) utilise le **big-endian** : l'octet de poids fort en premier.

```
Valeur uint16_t = 0x1234

Big-endian (réseau)    : [0x12, 0x34]   ← MSB en premier
Little-endian (Intel)  : [0x34, 0x12]   ← LSB en premier
```

Tu **dois** convertir avant d'écrire sur le fil. Sinon ton paquet sera lisible sur la même architecture (Intel parle à Intel) mais pas portable.

### 3.2 Le pattern `put_u*_be` / `get_u*_be`

Plutôt que d'utiliser des `htons`/`htonl` partout (qui convertissent depuis l'host), on écrit nos primitives qui prennent une valeur **logique** et écrivent toujours en big-endian, indépendamment de l'host :

```c
// ccsds.c:8-18
static void put_u16_be(uint8_t *p, uint16_t v) {
    p[0] = (uint8_t)(v >> 8);
    p[1] = (uint8_t)(v & 0xFFu);
}

static void put_u32_be(uint8_t *p, uint32_t v) {
    p[0] = (uint8_t)((v >> 24) & 0xFFu);
    p[1] = (uint8_t)((v >> 16) & 0xFFu);
    p[2] = (uint8_t)((v >> 8) & 0xFFu);
    p[3] = (uint8_t)(v & 0xFFu);
}
```

C'est portable (marche pareil sur Intel, ARM, big-endian PowerPC) et explicite (tu vois exactement ce qui sort).

> **Pourquoi pas `struct __attribute__((packed))` + `memcpy` ?**
> Tentant : tu déclares ta struct avec les champs dans le bon ordre, tu mets `__attribute__((packed))` pour virer le padding, et tu memcpy. **Mauvaise idée pour 3 raisons** :
> 1. **Endianness** : la struct est en endianness host. Sur Intel tu envoies en little-endian. Pour rendre big-endian il te faut quand même convertir.
> 2. **Alignement** : `packed` désaligne les champs. Sur ARM-Cortex-M0 (sans support de loads non alignés), un `uint32_t` non aligné = trap = crash.
> 3. **Maintenance** : un dev futur ne voit pas le layout en lisant la struct. Avec offsets explicites comme dans `telemetry.c`, le layout **est** le code.
>
> Sérialiser à la main est **plus de lignes** mais **infiniment plus robuste**. C'est la pratique standard du flight software.

### 3.3 Le miroir TypeScript

Côté backend Node, on a `Buffer.readUInt16BE(offset)` / `Buffer.writeUInt16BE(value, offset)` qui font exactement la même chose. Pas besoin de réinventer :

```typescript
// ccsds.ts:77-79
buf.writeUInt16BE(w0, offset);
buf.writeUInt16BE(w1, offset + 2);
buf.writeUInt16BE(dataLengthMinus1 & 0xffff, offset + 4);
```

Symétrie parfaite avec le C.

---

## 4. Le Space Packet — primary header

Tout paquet CCSDS commence par un **primary header de 6 octets**, organisé en **3 mots de 16 bits**, tous en big-endian.

```
Octet:  0       1       2       3       4       5
Bits:   |-PVN-|T|S|--APID--|-SF-|---SEQ---|------PDL------|
        15  13 12 11 10  0 15 14 13     0 15            0
```

| Champ | Bits | Sens |
|---|---|---|
| **PVN** (Packet Version Number) | 3 | Toujours `0` (version 1 du standard) |
| **T** (Type) | 1 | `0` = TM (downlink), `1` = TC (uplink) |
| **S** (Secondary Header Flag) | 1 | `1` si un secondary header suit (toujours chez nous) |
| **APID** (Application Process ID) | 11 | Identifie le sous-système. 0..2047 |
| **SF** (Sequence Flags) | 2 | `0b11` = paquet non-segmenté (toujours chez nous) |
| **SEQ** (Sequence Count) | 14 | Compteur 0..16383, **par APID**, qui wrap |
| **PDL** (Packet Data Length) | 16 | **Taille de tout ce qui suit le primary header, MOINS 1** |

### 4.1 Le piège PDL "minus 1"

> **Le piège classique :** PDL n'encode **pas** la taille du payload, ni la taille totale du paquet. Il encode `(taille_post_header) - 1`.
>
> Pourquoi ? Parce qu'à l'origine du standard, on a réservé 16 bits pour PDL et on voulait pouvoir dire "1 octet" sans gaspiller. Donc PDL=0 → 1 octet, PDL=1 → 2 octets, etc. C'est **historique et bizarre**, mais c'est la règle.

Côté firmware (`telemetry.c:48`) :

```c
const uint16_t body_len =
    (uint16_t)(CCSDS_PUS_TM_SEC_HDR_SIZE + APOGEE_HK_PAYLOAD_SIZE +
               CCSDS_CRC_SIZE);
//  body_len = 7 + 25 + 2 = 34

ccsds_pack_primary_header(..., (uint16_t)(body_len - 1u));
//  PDL field = 33 = 0x0021
```

Côté backend (`ccsds.ts:158`) :

```typescript
dataLength: pdl + 1,   // on remet le +1 immédiatement
```

Il décode `pdl` brut puis le re-corrige en `dataLength = pdl + 1`. Le reste du code voit `dataLength = 34` qui est plus intuitif.

### 4.2 Encodage word 0 — bit packing

```c
// ccsds.c:31-35
uint16_t w0 = (uint16_t)((CCSDS_PVN & 0x07u) << 13);  // bits 15..13
w0 |= (uint16_t)((type & 0x01u) << 12);                // bit 12
w0 |= (uint16_t)((sec_hdr ? 1u : 0u) << 11);           // bit 11
w0 |= (uint16_t)(apid & 0x07FFu);                      // bits 10..0
```

Lecture étape par étape pour APID = 0x100, type=TM (0), sec_hdr=true :
- `PVN=0 << 13` = `0x0000`
- `type=0 << 12` = `0x0000`
- `sec_hdr=1 << 11` = `0x0800`
- `apid=0x100` = `0x0100`
- **w0 = 0x0900**

Décodage symétrique côté C (`ccsds.c:82-87`) et côté TS (`ccsds.ts:148-159`) — c'est le même squelette en négatif.

### 4.3 Compteur de séquence par APID

```c
// telemetry.c:5-6
static uint16_t hk_seq  = 0;
static uint16_t ack_seq = 0;
```

Chaque APID a **son** compteur. Ils sont indépendants. Le compteur est sur 14 bits (max 16383), wrap modulo 16384 :

```c
hk_seq = (uint16_t)((hk_seq + 1u) & 0x3FFFu);
```

Le `& 0x3FFFu` masque sur 14 bits, donc 16384 → 0 automatiquement.

Pourquoi ce design ? Parce qu'au sol on peut **détecter une perte de paquet** par APID : si je reçois HK seq=15 puis seq=17, j'ai perdu seq=16. C'est le seul mécanisme de loss detection sur UDP — donc essentiel.

---

## 5. PUS-C secondary header

Le primary header est minimaliste. Le **secondary header PUS** ajoute la sémantique ECSS standard.

### 5.1 PUS-C TM secondary (7 octets)

Pour les paquets de télémétrie (downlink) :

```
Octet:  0       1       2       3       4       5       6
        |PVer|Service|Subtype|----CUC time (sec since epoch)-----|
```

| Champ | Taille | Sens |
|---|---|---|
| **PUS Version** | 1 B | `0x10` pour PUS-C (le 1 est dans les bits hauts) |
| **Service** | 1 B | Numéro de service ECSS |
| **Subtype** | 1 B | Sous-type dans le service |
| **CUC time** | 4 B | Unix time en secondes, big-endian |

Encodage (`ccsds.c:46-55`) :

```c
size_t ccsds_pack_pus_tm_secondary(uint8_t *buf, size_t buf_len,
                                   uint8_t service, uint8_t subtype,
                                   uint32_t cuc_seconds) {
    if (buf_len < CCSDS_PUS_TM_SEC_HDR_SIZE) return 0;
    buf[0] = PUS_VERSION_C;        // 0x10
    buf[1] = service;
    buf[2] = subtype;
    put_u32_be(&buf[3], cuc_seconds);
    return CCSDS_PUS_TM_SEC_HDR_SIZE;
}
```

> **Time codes — pourquoi CUC simple et pas CDS ?**
> CCSDS définit plusieurs formats de temps : CUC (Compact Unix Code, secondes + fraction), CDS (Calendar with Day Segmented), ASCII (texte). CUC est le plus simple, le plus compact, le plus utilisé. Pour Apogée on simplifie encore : 4 octets, secondes Unix entières. Pas de fraction. À 10 Hz on peut deduplicate par seq counter.

### 5.2 PUS-C TC secondary (4 octets)

Pour les telecommandes (uplink) :

```
Octet:  0       1       2       3
        |PVer|AckFlags|Service|Subtype|
```

| Champ | Taille | Sens |
|---|---|---|
| **PUS Version** | 1 B | `0x10` |
| **Ack Flags** | 1 B | Bits qui demandent acceptance/start/progress/completion ack. Mis à 0 en MVP. |
| **Service** | 1 B | Numéro de service |
| **Subtype** | 1 B | Sous-type |

Plus court que TM parce que les TC n'embarquent pas de timestamp (l'horodatage du sol est dans la couche transport sol).

---

## 6. CRC-16-CCITT-FALSE

### 6.1 Pourquoi ?

UDP a un checksum 16 bits **mais** il est facultatif sur IPv4 (souvent désactivé) et faible. CCSDS impose un CRC-16 sur tout paquet. Avantages :
- Détecte 100% des erreurs ≤ 16 bits, et la quasi-totalité des erreurs en burst.
- Cheap : 13 lignes de C, tient en cache L1 sur n'importe quoi.
- Identique côté firmware et backend → un seul code à valider.

### 6.2 La variante "FALSE"

Les CRC-16 ont plusieurs paramètres : polynôme, initialisation, réflexion d'entrée/sortie, XOR final. **CCITT-FALSE** =
- Polynôme : `0x1021`
- Init : `0xFFFF`
- Réflexion d'entrée : non
- Réflexion de sortie : non
- XOR final : `0x0000`

C'est la variante recommandée par CCSDS. Le "FALSE" vient du fait qu'historiquement, le standard CCITT décrivait un init à `0x0000` que tout le monde implémentait à `0xFFFF` — d'où le nom ironique. Aujourd'hui c'est le standard de fait.

### 6.3 Le code

```c
// crc16.c:3-16
uint16_t crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFFu;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);    // XOR octet dans le high byte
        for (int b = 0; b < 8; b++) {
            if (crc & 0x8000u) {
                crc = (uint16_t)((crc << 1) ^ 0x1021u);
            } else {
                crc = (uint16_t)(crc << 1);
            }
        }
    }
    return crc;
}
```

Lecture :
- `crc ^= data[i] << 8` injecte l'octet dans le high byte du CRC.
- Boucle 8 fois : si le bit 15 (qui sortirait de `<< 1`) est à 1, on XORe avec le polynôme. Sinon shift simple.

Le miroir TS (`ccsds.ts:47-56`) est identique au mask près (`& 0xffff` parce que JS travaille en 32 bits).

### 6.4 Le CRC couvre **tout** le paquet

```c
// ccsds.c:68-73
size_t ccsds_append_crc(uint8_t *buf, size_t buf_len, size_t packet_len) {
    if (buf_len < packet_len + CCSDS_CRC_SIZE) return 0;
    uint16_t crc = crc16_ccitt(buf, packet_len);   // sur tout le paquet
    put_u16_be(&buf[packet_len], crc);
    return packet_len + CCSDS_CRC_SIZE;
}
```

`packet_len` = taille du primary header + secondary + payload. Le CRC est calculé sur **tout ça** puis appendé en big-endian. À la verif, le receiver fait pareil et compare.

---

## 7. Catalog Apogée

Les définitions sont dans `ccsds.h:30-60` (firmware) et `ccsds.ts:18-44` (backend). Tableau récap :

### 7.1 APIDs

| APID | Direction | Sens |
|---|---|---|
| `0x100` | TM | Housekeeping reports |
| `0x101` | TM | Events (futur) |
| `0x102` | TM | TC verification (acks) |
| `0x200` | TC | Uplink commands |

### 7.2 Services PUS utilisés

| Service | Subtype | Direction | Sens |
|---|---|---|---|
| **1** Verification | 1 | TM | TC accepted (success ack) |
| **1** Verification | 2 | TM | TC rejected (failure ack) |
| **3** Housekeeping | 25 | TM | HK report |
| **8** Function | 1 | TC | Function call (SET_MODE, REBOOT) |
| **17** Test | 1 | TC | Connection test (PING) |

### 7.3 Function IDs (payload de Service 8/1)

| ID | Sens | Payload |
|---|---|---|
| `0x01` | SET_MODE | 1 octet : mode demandé (0..3) |
| `0x02` | REBOOT | aucun |

---

## 8. Voyage d'un paquet HK (40 octets)

Pour un CubeSat en mode NOMINAL à lat=43.4°, lon=3.42°, alt=400 km, batt=7400 mV, attitude (5°, 3°, -45°), tick=1234, à un instant `t_unix = 0x66380A3B`, seq=0 :

```
Offset  Hex             Sens
─────────────────────────────────────────────────────────────────
                        Primary Header (6 B)
00      09              \  word 0 = 0x0900
01      00              /  PVN=0, type=TM, sec_hdr=1, APID=0x100
02      C0              \  word 1 = 0xC000
03      00              /  seqf=0b11, seq_count=0
04      00              \  PDL = 0x0021 = 33
05      21              /  → body_len = 34 octets

                        PUS-C TM Secondary Header (7 B)
06      10              PUS version C
07      03              service = 3 (Housekeeping)
08      19              subtype = 25 (HK Report)
09      66              \
0A      38              |  cuc_seconds = 0x66380A3B
0B      0A              |  (Unix time)
0C      3B              /

                        HK Payload (25 B) — voir telemetry.h:19-30
0D      01              mode = 1 (NOMINAL)
0E      1C              \  battery_mv = 0x1CE8 = 7400
0F      E8              /
10      19              \
11      DB              |  lat_e7 = 0x19DBA440 = 434000000
12      A4              |  → 43.4°
13      40              /
14      02              \
15      0A              |  lon_e7 = 0x020A1F40 = 34200000
16      1F              |  → 3.42°
17      40              /
18      00              \
19      06              |  alt_m = 0x00061A80 = 400000
1A      1A              |  → 400 km
1B      80              /
1C      00              \  roll10 = 0x0032 = 50 → 5.0°
1D      32              /
1E      00              \  pitch10 = 0x001E = 30 → 3.0°
1F      1E              /
20      FE              \  yaw10 = 0xFE3E = -450 → -45.0°
21      3E              /
22      00              \
23      00              |  tick_count = 0x000004D2 = 1234
24      04              |
25      D2              /

                        CRC-16 (2 B)
26      ??              CRC big-endian sur octets 0..37
27      ??

Total: 40 octets
```

Le décodage côté backend (`apps/server/src/telemetry.ts:37-91`) reproduit ces étapes en sens inverse et produit un `TelemetrySample` JSON :

```json
{
  "ts": 1714915131000,
  "mode": "NOMINAL",
  "lat": 43.4,
  "lon": 3.42,
  "alt_m": 400000,
  "battery_v": 7.4,
  "attitude_deg": { "roll": 5.0, "pitch": 3.0, "yaw": -45.0 }
}
```

Qui est ensuite broadcasté en WebSocket vers le frontend.

---

## 9. Voyage d'une commande SET_MODE NOMINAL (14 octets)

Quand l'opérateur clique "SET_MODE NOMINAL" dans le HUD, le backend (`apps/server/src/command.ts:62-65`) compose ce paquet :

```
Offset  Hex             Sens
─────────────────────────────────────────────────────────────────
                        Primary Header (6 B)
00      1A              \  word 0 = 0x1A00
01      00              /  PVN=0, type=TC, sec_hdr=1, APID=0x200
02      C0              \  word 1 = 0xC000
03      00              /  seqf=0b11, seq_count=0
04      00              \  PDL = 0x0007 = 7
05      07              /  → body_len = 8 octets

                        PUS-C TC Secondary Header (4 B)
06      10              PUS version C
07      00              ack_flags = 0
08      08              service = 8 (Function)
09      01              subtype = 1 (Function call)

                        Payload (2 B)
0A      01              function_id = 0x01 (SET_MODE)
0B      01              requested_mode = 1 (NOMINAL)

                        CRC-16 (2 B)
0C      ??              CRC big-endian sur octets 0..11
0D      ??

Total: 14 octets
```

Le firmware reçoit ce buffer dans `command_handle` (`apps/firmware/src/command.c:43-85`), qui :
1. parse le primary header
2. vérifie type=TC, APID=0x200, taille cohérente, CRC OK, sec_hdr présent
3. parse le PUS TC secondary
4. dispatche sur (service=8, subtype=1) → `handle_function_call`
5. `handle_function_call` lit `payload[0]=0x01` (SET_MODE), `payload[1]=0x01` (NOMINAL)
6. appelle `sm_request_mode(sm, APOGEE_MODE_NOMINAL)` → vrai
7. retourne `CMD_OUTCOME_OK`

Et juste après dans `main.c:84-87`, on compose un ACK Service 1/1 et on l'envoie. Le backend le décode dans `ack.ts:29-71` et broadcaste un message `command_ack` au frontend.

---

## 10. Le miroir C ↔ TypeScript

C'est le pattern le plus important du projet. Chaque fonction C a sa jumelle TS :

| Côté C (`apps/firmware/src/`) | Côté TS (`apps/server/src/`) |
|---|---|
| `ccsds_pack_primary_header` | `packPrimaryHeader` (ccsds.ts:60) |
| `ccsds_parse_primary_header` | `parsePrimaryHeader` (ccsds.ts:143) |
| `ccsds_pack_pus_tm_secondary` | `packPusTmSecondary` (ccsds.ts:83) |
| `ccsds_parse_pus_tm_secondary` | `parsePusTmSecondary` (ccsds.ts:162) |
| `ccsds_pack_pus_tc_secondary` | `packPusTcSecondary` (ccsds.ts:97) |
| `ccsds_parse_pus_tc_secondary` | `parsePusTcSecondary` (ccsds.ts:174) |
| `ccsds_append_crc` | `appendCrc` (ccsds.ts:111) |
| `ccsds_verify_crc` | `verifyCrc` (ccsds.ts:186) |
| `crc16_ccitt` | `crc16Ccitt` (ccsds.ts:47) |
| `telemetry_compose_hk` | (côté firmware uniquement, encode TM) |
| (côté firmware uniquement, décode TC) | `decodeTelemetry` (telemetry.ts:37) |
| `telemetry_compose_ack` | `decodeAck` (ack.ts:29) |
| (côté backend uniquement, encode TC) | `encodePing` / `encodeSetMode` / `encodeReboot` (command.ts) |
| `command_handle` (décode TC) | (côté backend uniquement) |

Les **constantes** sont également dupliquées (APID, services, subtypes, fn IDs). C'est volontaire :

```c
// ccsds.h:32-35
#define APOGEE_APID_HK              0x100u
#define APOGEE_APID_EVENT           0x101u
#define APOGEE_APID_ACK             0x102u
#define APOGEE_APID_TC              0x200u
```

```typescript
// ccsds.ts:18-23
export const APID = {
  HK: 0x100,
  EVENT: 0x101,
  ACK: 0x102,
  TC: 0x200,
} as const;
```

> **Pourquoi ne pas générer le TS depuis le C (ou l'inverse) avec un schema partagé ?**
> Tentant — un schema YAML/JSON puis un codegen. **Trois raisons** de ne pas le faire ici :
> 1. Le code reste **trivial** à lire des deux côtés. Pas de magie, pas de templates.
> 2. La discipline d'écrire les deux **te force à comprendre** le format. C'est exactement ce qu'on veut quand on apprend.
> 3. Le coût de duplication est faible (60 lignes de constants × 2). Le coût d'un codegen serait : un nouveau format, un nouveau script, une nouvelle source de bugs.
>
> Sur un projet à 10× la taille (50 services PUS, 200 APIDs), oui, codegen. Pour Apogée, non.

Pour vérifier qu'on ne diverge pas, le CI pourrait lancer un test "le firmware émet un paquet HK, le backend le décode, on compare le sample au snapshot". On ne l'a pas encore mais c'est l'évolution naturelle.

---

## 11. Pour aller plus loin

### 11.1 Service 5 — Events

Un service entier dédié aux événements (info, warning, error, alarm). Le firmware émettrait un paquet APID 0x101 chaque fois qu'il transitionne de mode, détecte un sous-voltage batterie, etc. Pour V1.

### 11.2 Segmentation

Si un paquet est trop gros pour la radio (max ~256 octets en VHF), CCSDS supporte la segmentation : flag `seq_flags` dans le primary header passe de `0b11` (unsegmented) à `0b01` (first), `0b00` (continuation), `0b10` (last). On peut reconstruire le paquet logique côté sol. Pas implémenté ici parce qu'UDP local nous donne du MTU 64 KB.

### 11.3 Time codes plus précis

CUC peut être étendu avec une partie fractionnaire (sous-seconde sur 1, 2 ou 4 octets). En vol on utilise typiquement 4+2 ou 4+4. Permet l'horodatage à la milliseconde voire microseconde, utile pour la corrélation multi-instruments.

### 11.4 Authentification — HMAC

Aujourd'hui n'importe quel paquet UDP arrivant sur le port 5002 est exécuté. Pour la phase sécu d'Apogée on rajoutera un HMAC-SHA256 dans une **trailer extension** (post-payload, pré-CRC) avec une clé partagée. Service 8/1 deviendra HMAC-required ; PING (17/1) restera ouvert pour santé. C'est ton cœur de métier — quand tu en parles en démo, c'est *ton* terrain.

### 11.5 Vraie liaison radio

Le SPP est encapsulé typiquement dans :
- **AOS** (Advanced Orbiting Systems) ou **TM/TC Space Data Link Protocol** au niveau frame
- **Reed-Solomon** ou **LDPC** pour la correction d'erreur
- **Modulation** (BPSK, QPSK, GMSK) sur la porteuse RF

Apogée saute ces couches parce qu'on est sur UDP local. Pour une démo CubeSat amateur, GNU Radio + un dongle SDR ($30) peut décoder les vraies bandes UHF amateur — c'est la route si tu veux pousser plus loin.

---

## Fin

Une fois ces deux docs digérés (firmware en C + protocole CCSDS) tu **possèdes** ton projet. Tu peux le défendre, l'étendre, expliquer chaque décision. C'est largement assez pour une démo patron, et solide pour un entretien CubeSat / spatial.

Si on fait la lecture commentée ensemble, dis-moi ce qui reste flou — on s'arrête là-dessus.
