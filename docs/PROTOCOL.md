# Apogée — Protocole de communication

> Document pédagogique. Lis-le linéairement, c'est conçu pour ça. Pas besoin de connaissance préalable en télécoms spatiales.

## 1. Pourquoi un standard ? (et pas juste « notre format à nous »)

Quand un CubeSat parle au sol, il y a deux extrémités à brancher :

- **Bord** : un microcontrôleur (STM32, MSP430, RPi…) qui produit de la télémétrie et reçoit des commandes.
- **Sol** : un logiciel de mission control (YAMCS, OpenC3 COSMOS, cFS Ground, AIT…) qui affiche, scripte, archive, alarme.

Si chaque mission invente son format, deux problèmes :

1. **Aucun outil sol existant ne sait te lire** — tu réinventes ton dashboard, ton décodeur, ton archive.
2. **Aucun firmware tiers ne se branche** — tu ne peux pas réutiliser le code d'un autre projet, ni démontrer ton banc avec une vraie carte CubeSat.

Le monde spatial s'est mis d'accord sur des standards **ouverts** (publiés gratuitement) qui résolvent les deux. Apogée s'aligne dessus pour rester un **banc de test segment-sol crédible**, pas une démo isolée.

## 2. Le paysage des standards (vue à 30 000 pieds)

Trois familles cohabitent. Il faut savoir les distinguer pour comprendre **où** se positionne Apogée.

### 2.1 CCSDS — la couche basse universelle

**CCSDS** (Consultative Committee for Space Data Systems) regroupe NASA, ESA, JAXA, CNES, Roscosmos… Ils publient les standards utilisés par **toutes les missions institutionnelles** depuis les années 80 : ISS, Mars rovers, JWST, Sentinel, Galileo, et la majorité des CubeSats sérieux.

Les briques CCSDS pertinentes ici :

| Standard | Rôle |
|---|---|
| **CCSDS 133.0-B-2** Space Packet Protocol | Format du **paquet** application (en-tête de 6 octets + données) |
| CCSDS 132.0-B TM Space Data Link Protocol | Encapsulation **trame** sol↔bord (couche liaison) |
| CCSDS 232.0-B TC Space Data Link Protocol | Trames de télécommande montantes |
| CCSDS 131.0-B Channel Coding | Codage canal (Reed-Solomon, Turbo, LDPC) |

Pour Apogée, on s'occupe **uniquement du Space Packet Protocol** (133.0-B-2) — c'est la couche application, la seule qui voyage de bout en bout. Le reste (trames, codage canal) c'est la radio HF, hors scope.

### 2.2 ECSS-PUS — la couche application européenne

**PUS** = **Packet Utilization Standard**, publié par l'**ECSS** (European Cooperation for Space Standardization, le pendant européen). Norme **ECSS-E-ST-70-41C** (révision PUS-C, 2016).

Si CCSDS te dit *« voici la forme du paquet »*, PUS te dit *« voici la sémantique : ce que tu mets dedans, et quels services standardisés un satellite doit offrir »*.

PUS définit **23 services** numérotés. Quelques-uns qu'on utilise dans Apogée :

| Service | Numéro | Usage |
|---|---|---|
| Request Verification | 1 | Accusés de réception des télécommandes |
| Housekeeping | 3 | Télémétrie périodique (notre flux 10 Hz) |
| Event Reporting | 5 | Événements ponctuels (transitions de mode, fautes) |
| Memory Management | 6 | Lecture/écriture mémoire bord |
| Function Management | 8 | Appel de fonctions bord (`SET_MODE`, `REBOOT`) |
| Test | 17 | Ping (« es-tu vivant ? ») |

PUS est **utilisé par toutes les missions ESA** (Sentinel, Solar Orbiter, BepiColombo, JUICE) et de plus en plus par les CubeSats étudiants encadrés par l'ESA Education Office.

### 2.3 CSP (Cubesat Space Protocol) — l'alternative légère

**libcsp**, créé chez GomSpace (DK), est un protocole réseau minimaliste pensé spécifiquement CubeSat. Il rappelle TCP/IP mais pèse <2 ko de RAM. Très répandu dans l'écosystème CubeSat académique nordique (AAUSAT, Delfi, NanoAvionics).

**Différence philosophique** :

- CCSDS+PUS : verbeux, normé, professionnel, **interopérable** avec n'importe quel sol institutionnel.
- CSP : pragmatique, léger, **rapide à implémenter** mais nécessite un sol custom (peu d'outils standards le parlent).

Une étude récente (Small Sat Conference 2023, *« Confronting or Linking CSP and CCSDS? »*) recommande de **monter CSP au-dessus de CCSDS** quand on veut le meilleur des deux. Pour Apogée, on prend **CCSDS+PUS direct** : c'est plus crédible auprès des cibles pro (Look Up Space, CS Group, Thales, CLS), c'est ce que YAMCS et OpenC3 décodent nativement, et c'est ce qu'utilisent les bancs sol des conférences sécu (CYSAT démontre des attaques sur CCSDS+PUS, pas sur CSP).

## 3. Notre choix pour Apogée

> **CCSDS Space Packet (133.0-B-2)** + un **sous-ensemble PUS-C** minimal.

Avantages :

- Un firmware tiers parlant CCSDS+PUS se **branche directement** sur notre backend.
- YAMCS/COSMOS pourraient lire notre flux moyennant une config — c'est notre marqueur de crédibilité.
- Phase 3 (sécu) pourra **démontrer des attaques publiées** (replay, injection PUS) sur du vrai CCSDS, pas sur un format propriétaire.

Tradeoff : un en-tête plus verbeux que notre format actuel (16+ octets vs 0). On l'assume.

## 4. Anatomie d'un Space Packet CCSDS

Chaque paquet a la structure suivante :

```
+----------------------+----------------------+----------------------+
|  Primary Header (6B) | Secondary Hdr (opt.) |   User Data Field    |
+----------------------+----------------------+----------------------+
                                              |  Optional CRC trailer |
                                              +----------------------+
```

### 4.1 Primary Header — 6 octets, obligatoire

C'est la carte d'identité du paquet. **Bit-à-bit**, big-endian (network order) :

```
Octet 0          Octet 1          Octet 2          Octet 3          Octet 4          Octet 5
7 6 5 4 3 2 1 0  7 6 5 4 3 2 1 0  7 6 5 4 3 2 1 0  7 6 5 4 3 2 1 0  7 6 5 4 3 2 1 0  7 6 5 4 3 2 1 0
+-----+-+-+-----+----------------+-----+----------+----------------+--------------------------------+
| VER |T|S|        APID         |SEQF |     Sequence Count          |        Packet Data Length       |
+-----+-+-+----------------------+-----+-----------------------------+--------------------------------+
 3 bits 1 1   11 bits             2 b           14 bits                            16 bits
```

| Champ | Bits | Sens |
|---|---|---|
| **VER** Version Number | 3 | Toujours `0b000` (version 1 du standard) |
| **T** Packet Type | 1 | `0` = télémétrie (TM, downlink), `1` = télécommande (TC, uplink) |
| **S** Secondary Header Flag | 1 | `1` si on a un secondary header (timestamp, etc.), `0` sinon |
| **APID** Application Process ID | 11 | Identifie le sous-système émetteur/destinataire (0..2047) |
| **SEQF** Sequence Flags | 2 | `0b11` pour un paquet complet (pas de fragmentation) |
| **Sequence Count** | 14 | Compteur incrémental par APID, modulo 16384 |
| **Packet Data Length** | 16 | Taille du **reste du paquet** moins 1, en octets |

Note importante sur **Packet Data Length** : si tu as 12 octets de données après le primary header, tu écris `12 - 1 = 11` (`0x000B`). Cette convention vient du fait que la valeur 0 signifie « 1 octet de données », pas « zéro octet ». C'est dans la spec, c'est le piège classique d'implémentation.

### 4.2 APIDs choisis pour Apogée

L'APID est **notre adressage logique**. On le découpe en plages thématiques :

| APID | Direction | Sous-système | Usage |
|---|---|---|---|
| `0x100` (256) | TM | OBC (On-Board Computer) | Télémétrie housekeeping périodique |
| `0x101` (257) | TM | OBC | Événements (mode change, fault) |
| `0x102` (258) | TM | OBC | Acks de télécommandes |
| `0x200` (512) | TC | OBC | Télécommandes générales (PING, SET_MODE, REBOOT) |
| `0x7FF` (2047) | — | Idle | Réservé CCSDS, ne pas utiliser |

**Pour la suite** (Phase 4+), on pourra ajouter `0x110` ADCS, `0x120` EPS, `0x130` payload, etc. C'est la conv pro : un APID par sous-système.

### 4.3 Secondary Header — timestamp PUS

Pour PUS, le secondary header transporte un **timestamp CUC (CCSDS Unsegmented Code)** + un en-tête PUS minimal. On simplifie ainsi :

**Pour la TM (downlink, en-tête PUS-A)** — 7 octets :

```
+------+------+--------+--------+--------+--------+--------+
| PVN  | STYP | SUBTYPE|         CUC Timestamp (4 octets, secondes Unix)         |
+------+------+--------+--------+--------+--------+--------+
 1 oct  1 oct  1 oct
```

| Champ | Bytes | Sens |
|---|---|---|
| PVN — PUS Version Number | 1 | `0x10` pour PUS-C (version 2) |
| STYP — Service Type | 1 | Cf. tableau §2.2 (3, 5, 17…) |
| SUBTYPE | 1 | Sous-fonction du service (ex: Service 5 / Subtype 1 = info event) |
| CUC Timestamp | 4 | Secondes depuis epoch 1970 (UInt32 BE) — assez pour notre démo |

**Pour la TC (uplink)** — 4 octets simplifiés :

```
+------+------+--------+--------+
| PVN  | ACK  | STYP   | SUBTYPE|
+------+------+--------+--------+
```

Le champ **ACK** (4 bits dans la spec officielle, on prend 1 octet pour rester aligné) demande au bord d'envoyer un acquit (Service 1) à différents stades : acceptation, démarrage, progression, terminaison.

> **Simplification assumée** : la spec PUS-C a un secondary header plus riche (sub-counter, source ID, etc.). On garde le minimum pour rester lisible. Documenté ici, déviation tracée.

### 4.4 User Data Field

C'est le **payload** spécifique au service/subtype. Exemples :

- **Service 3 / Subtype 25** (Housekeeping report) → notre paquet de télémétrie 22 octets (lat/lon/alt/batt/attitude)
- **Service 17 / Subtype 1** (Connection test) → vide
- **Service 8 / Subtype 1** (Function call) → ID de fonction (1 octet) + arguments (n octets)

### 4.5 CRC trailer (PUS optionnel, on le garde)

PUS-C **autorise** un CRC-16 en fin de paquet pour la TC (et certains profils TM). On le garde sur **tous nos paquets** car notre lien de transport (UDP localhost) n'a pas de garantie de non-corruption à grande échelle, et c'est ce qui nous permet de continuer à détecter une corruption mémoire firmware.

CRC : **CRC-16-CCITT-FALSE**, polynôme `0x1021`, init `0xFFFF`, pas d'XOR final. C'est ce qu'on a déjà — on garde la même implé (`crc16.c`).

## 5. Exemple concret — un paquet de télémétrie Apogée

Disons : à `t = 1746360000` (Unix), mode NOMINAL, APID `0x100`, sequence 42, batterie 7400 mV, lat=43.34°N, lon=3.42°E, alt=400 km.

**Construction** :

```
Primary Header (6 octets)
  Octet 0-1 : 000 0 1 00100000000 = 0x0900   (VER=0, T=0, S=1, APID=0x100)
  Octet 2-3 : 11 00000000101010   = 0xC02A   (SEQF=0b11, Seq=42)
  Octet 4-5 : 0x001D                          (PDL = total - PH - 1 = 36 - 6 - 1 = 29)

Secondary Header PUS (7 octets)
  PVN     : 0x10
  STYP    : 0x03   (Service 3 — Housekeeping)
  SUBTYPE : 0x19   (Subtype 25 — HK report)
  CUC     : 0x68185040  (1746360000 en BE)

User Data (22 octets)
  mode      (1B) : 0x01
  battery_mv (2B BE) : 0x1CE8     (7400)
  lat_e7    (4B BE) : 0x19D54080  (433_430_000)
  lon_e7    (4B BE) : 0x020A0680  (34_200_000)
  alt_m     (4B BE) : 0x00061A80  (400_000)
  roll10    (2B BE) : 0x0000
  pitch10   (2B BE) : 0x0000
  yaw10     (2B BE) : 0x0000
  reserved  (3B)    : 0x000000

CRC trailer (2 octets)
  CRC-16-CCITT sur tout ce qui précède : 0x???? (calculé)
```

**Total : 37 octets**. Comparer à nos 40 actuels — c'est dans le même ordre de grandeur, gain en interopérabilité énorme.

## 6. Sous-ensemble PUS implémenté en Phase 2.6

On reste **minimal et utile**. Les services qu'on implémente :

### Service 17 — Test
- **17/1** Connection test request (TC) → **17/2** Connection test report (TM)
- Sert de « ping ». Aucun argument.

### Service 8 — Function management
- **8/1** Function call (TC) avec un arg `function_id` (1 octet) :
  - `0x01` SET_MODE — arg supplémentaire = mode (1 octet : 0=SAFE, 1=NOMINAL, 2=COMMS, 3=FAULT)
  - `0x02` REBOOT — pas d'arg

### Service 1 — Request verification
- **1/1** TC acceptance success (TM) — émis par le bord après chaque TC valide
- **1/2** TC acceptance failure (TM) — émis si CRC KO, APID inconnu, ou function refusée par la state machine

### Service 3 — Housekeeping
- **3/25** HK parameter report (TM) — notre flux 10 Hz actuel

### Service 5 — Event reporting
- **5/1** Informative event (TM) — transitions de mode, ex: `BOOT → SAFE`
- **5/4** High-severity event (TM) — réservé pour Phase 3 (alertes sécu)

## 7. Migration depuis le format actuel

Notre paquet `TelemetryPacket` actuel (40 octets, magic 0xAB1E, little-endian) **n'est pas CCSDS**. Il faut le réécrire.

**Plan de migration** :

1. **Sprint 2.6.1** — Implémenter les structures CCSDS dans `apps/firmware/src/ccsds.{c,h}` et `apps/server/src/ccsds.ts`. Helpers : encode primary header, encode PUS secondary, append CRC.
2. **Sprint 2.6.2** — Réécrire `telemetry_compose` pour produire un **Service 3/25 housekeeping report** au lieu du format custom. Adapter `decodeTelemetry` côté backend.
3. **Sprint 2.6.3** — Implémenter **Service 17/1 (PING)** et **Service 8/1 (SET_MODE/REBOOT)** : décodeur firmware + encodeur backend.
4. **Sprint 2.6.4** — Implémenter **Service 1/1 et 1/2 (acks)** : le firmware émet un ack TM pour chaque TC reçue ; le backend les forward au frontend par WS.
5. **Sprint 2.6.5** — Frontend : panel commandes + affichage des acks et événements.

**Impact sur la state machine** : **on supprime** la promotion automatique BOOT→NOMINAL (lignes 60-71 de `main.c`). Le firmware reste en SAFE, c'est l'opérateur qui passe en NOMINAL via TC.

## 8. Endianness — piège à connaître

CCSDS impose **big-endian (network order)**. Notre format actuel est little-endian. Il faut donc :

- Côté firmware : utiliser `htons()` / `htonl()` pour tout champ multi-octets dans les paquets CCSDS.
- Côté Node.js : `buf.writeUInt16BE`, `writeUInt32BE`, etc.
- Au sein du **payload utilisateur** la spec laisse libre, mais par convention on reste BE pour la cohérence.

Le `_Static_assert(sizeof == N)` reste indispensable côté firmware pour figer la taille de chaque report.

## 9. Sécurité (préfiguration Phase 3)

CCSDS **n'inclut pas de chiffrement ni d'authentification natifs**. C'est délégué à des extensions optionnelles :

- **CCSDS 355.0-B-2** SDLS — Space Data Link Security (chiffrement + intégrité au niveau frame)
- **CCSDS 351.0-M-1** Security Architecture — guide d'archi
- **HMAC custom** appliqué au paquet PUS, ce qui est notre choix pour Apogée Phase 3

Le fait que CCSDS soit **clair par défaut** est exactement ce qui rend les démos d'attaque pertinentes en conférence sécu (replay, tampering, MITM). Voir l'article [« Fuzzing Space Communication Protocols »](https://www.ndss-symposium.org/wp-content/uploads/spacesec25-final12.pdf) (NDSS SpaceSec 2025).

## 10. Pour aller plus loin

| Ressource | Pourquoi |
|---|---|
| [CCSDS 133.0-B-2 Space Packet Protocol (PDF officiel)](https://ccsds.org/Pubs/133x0b2e2.pdf) | La spec primaire, 30 pages, lisible |
| [Report 130.3-G-1 Space Packet Protocols Overview](https://ccsds.org/Pubs/130x3g1.pdf) | Guide pédagogique CCSDS |
| [ECSS-E-ST-70-41C PUS-C](https://ecss.nl/standard/ecss-e-st-70-41c-space-engineering-telemetry-and-telecommand-packet-utilization-15-april-2016/) | La spec PUS officielle (gratuite après inscription ECSS) |
| [PUSopen.com — vulgarisation PUS](https://pusopen.com/ecss-pus) | Bonne intro accessible |
| [CCSDSPy](https://docs.ccsdspy.org/en/latest/user-guide/ccsds.html) | Bibliothèque Python de référence pour décoder |
| [KubOS ccsds-spacepacket](https://github.com/KubOS-Preservation-Group/ccsds-spacepacket) | Implémentation Rust propre, utile à comparer |
| [libcsp (alternative)](https://github.com/libcsp/libcsp) | Pour comprendre l'autre école |
| [« Confronting CSP and CCSDS »](https://digitalcommons.usu.edu/smallsat/2023/all2023/173/) | Article SmallSat 2023, lecture clé |
| [YAMCS](https://yamcs.org/) | Le mission control sur lequel on pourrait brancher Apogée demain |
| [OpenC3 COSMOS](https://docs.openc3.com/docs) | L'autre référence open source |

## 11. Glossaire

| Terme | Définition |
|---|---|
| **APID** | Application Process Identifier. Identifiant logique d'un flux de paquets dans CCSDS. |
| **CCSDS** | Consultative Committee for Space Data Systems. Organisme international de normalisation. |
| **CRC** | Cyclic Redundancy Check. Somme de contrôle pour détecter la corruption. |
| **CUC** | CCSDS Unsegmented Code. Format de timestamp CCSDS. |
| **ECSS** | European Cooperation for Space Standardization. Pendant européen, plus orienté missions ESA. |
| **HK** | Housekeeping. Télémétrie périodique d'état (batterie, température, mode…). |
| **OBC** | On-Board Computer. Calculateur principal du satellite. |
| **PUS** | Packet Utilization Standard. Standard ECSS définissant 23 services applicatifs. |
| **TC** | TeleCommand. Paquet sol → bord. |
| **TM** | TeleMetry. Paquet bord → sol. |
| **SDLS** | Space Data Link Security. Extension CCSDS pour chiffrement/intégrité. |

---

*Phase 2.6 — Document vivant. À mettre à jour à chaque ajout de service ou changement de format.*
