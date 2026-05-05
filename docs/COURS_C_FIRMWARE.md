# Cours #1 — Le firmware en C

> Lecture estimée : 30 min. Ce document est conçu pour être lu **avec le code ouvert à côté**.
> Toutes les références sont du type `fichier:ligne`. Tu cliques, tu vois, tu reviens ici.
>
> Audience : dev web qui connaît PHP/JS/TS et veut comprendre le delta avec le C embarqué.

---

## Comment lire ce document

1. Lis la section 2 (bases C) en diagonale — c'est un rappel ciblé sur ce que **ce code** utilise.
2. Lis ensuite section 3 à 7 dans l'ordre. Chaque section présente un module C, en commençant par la question à laquelle il répond.
3. Les boîtes `Pourquoi pas autrement ?` couvrent les choix non-évidents — c'est ce qu'un recruteur ou un patron pourrait te demander.
4. Pour le protocole binaire (CCSDS, PUS, CRC), va voir [`COURS_COMMS_PROTOCOLE.md`](COURS_COMMS_PROTOCOLE.md). Ce document-ci se concentre sur le **C** lui-même.

---

## 1. Pourquoi le C ?

Le vrai flight software vole en C (et un peu d'Ada). Pas du Rust — pas encore. Pas du C++ — trop d'inconnu sur les exceptions, RTTI, opérateur new, allocateurs cachés. Le C **embarqué spatial** impose trois règles non-négociables :

1. **Allocation statique uniquement.** Pas de `malloc`. Tout ce dont tu as besoin est connu à la compilation. Pourquoi ? Parce qu'en orbite, si l'allocateur fragmente la heap après 6 mois, tu ne peux pas redémarrer ton satellite avec un câble USB.
2. **Pas de récursion.** La pile a une taille fixe et faible. Une récursion non bornée = stack overflow = mission perdue.
3. **Build sans warning.** `-Wall -Wextra -Werror -Wpedantic`. Un warning c'est un bug en sursis.

Voir le `Makefile` (`apps/firmware/Makefile:5`) pour les flags. Le firmware Apogée respecte ces trois règles.

> **Pourquoi pas Rust ?** Parce que la stack flight-proven en Rust n'existe pas encore (mi-2026, on commence à en parler chez ESA). Pour un projet pédagogique, choisir C est plus crédible auprès des recruteurs spatiaux.

---

## 2. Le delta C vs JS/TS

Tu connais déjà la programmation. Voilà ce qui change concrètement dans **ce projet**.

### 2.1 Types à taille fixe

```c
#include <stdint.h>

uint8_t  byte;          // 0..255
int8_t   signed_byte;   // -128..127
uint16_t word;          // 0..65535
int16_t  signed_word;
uint32_t dword;
int32_t  signed_dword;
```

Tu choisis la taille **explicitement**. C'est obligatoire quand tu sérialises sur un fil — un `int` côté C peut faire 2 ou 4 ou 8 octets selon la plateforme. Ici tout est `uintN_t` parce que la wire est définie au bit près.

### 2.2 Structs et `sizeof`

```c
typedef struct {
    ApogeeMode mode;
    uint32_t   tick_in_mode;
    uint32_t   total_ticks;
} StateMachine;
```

Pas de méthodes, pas de constructeur, pas de garbage collector. Tu alloues une variable de ce type, le compilateur réserve la taille (`sizeof(StateMachine)`). Le `typedef` te permet d'écrire `StateMachine sm;` au lieu de `struct StateMachine sm;`.

`sizeof X` retourne la taille en octets, à la **compilation**. C'est utilisé partout :

```c
ssize_t n = net_recv_nonblock(tc_buf, sizeof tc_buf);
```

Note la syntaxe : `sizeof tc_buf` (sans parenthèses) marche sur une variable. `sizeof(int)` (avec parenthèses) marche sur un type. Préfère la première sur les variables, c'est plus sûr quand tu refactores le type.

### 2.3 Pointeurs et tableaux

```c
uint8_t buf[40];      // tableau statique de 40 octets sur la pile
uint8_t *p = buf;     // p pointe sur le premier octet
p[3] = 0xAB;          // équivaut à *(p + 3) = 0xAB
```

Un tableau **se comporte comme** un pointeur sur le premier élément quand tu le passes à une fonction. C'est pour ça que dans nos signatures :

```c
size_t telemetry_compose_hk(uint8_t *buf, size_t buf_len, ...);
```

Le `size_t buf_len` est obligatoire — la fonction n'a aucun moyen de savoir la taille du tableau toute seule. C'est un piège classique : **toujours passer la longueur avec le pointeur**.

### 2.4 Stack vs static (pas de heap ici)

```c
int main(void) {
    StateMachine sm;       // sur la pile, 12B
    PhysicsState phys;     // sur la pile
    uint8_t tm_buf[40];    // sur la pile
    ...
}
```

Tout est sur la **stack** (la pile d'appel) ou **static** (segment data alloué au démarrage du process). Pas de `malloc`. Quand `main` retourne, tout est libéré automatiquement.

Pour rendre une variable globale persistante au sein d'une fonction, on la déclare `static` :

```c
static uint16_t hk_seq = 0;     // dans telemetry.c:5
```

Ce `hk_seq` survit aux appels successifs à `telemetry_compose_hk()`, **mais** reste invisible aux autres modules (le `static` au niveau fichier signifie "file-scope").

> **Le double sens de `static`** :
> - Devant une variable **dans une fonction** : la variable persiste entre les appels (équivalent moral d'un singleton).
> - Devant une variable **au niveau fichier** : la variable est privée au fichier (pas exportée vers les autres unités de compilation).
> - Devant une **fonction** au niveau fichier : la fonction est privée au fichier.
>
> Voir `ccsds.c:8-22` pour des fonctions `static` privées (helpers d'encodage qui ne doivent pas fuir hors du module).

### 2.5 Opérations sur les bits

Le C est le langage des shifts et masks. On en abuse pour empaqueter des champs dans des octets :

```c
// ccsds.c:31-34 — packer le mot 0 du primary header
uint16_t w0 = (uint16_t)((CCSDS_PVN & 0x07u) << 13);  // version sur 3 bits
w0 |= (uint16_t)((type & 0x01u) << 12);                // type sur 1 bit
w0 |= (uint16_t)((sec_hdr ? 1u : 0u) << 11);           // sec_hdr sur 1 bit
w0 |= (uint16_t)(apid & 0x07FFu);                      // APID sur 11 bits
```

À retenir :
- `<<` shift gauche, `>>` shift droite, `|` OR bit à bit, `&` AND bit à bit.
- `& 0x07u` masque sur 3 bits (0b111). `0x07FFu` masque sur 11 bits.
- Le suffixe `u` rend la constante **unsigned** — important pour éviter les comportements indéfinis sur les shifts.

Le détail est expliqué dans le doc protocole. Ici retiens juste que ce pattern est **omniprésent** dès qu'on parle binaire.

### 2.6 Headers et include guards

Chaque module a deux fichiers : `xxx.h` (ce qui est public) et `xxx.c` (ce qui est privé, l'implémentation). Le `.h` se termine toujours par :

```c
#ifndef APOGEE_NET_H
#define APOGEE_NET_H
// ... declarations ...
#endif
```

C'est l'**include guard** — empêche que le fichier soit inclus plusieurs fois et que tu te retrouves avec des redéfinitions. C'est laid mais nécessaire (le C n'a pas de système de modules).

### 2.7 `volatile sig_atomic_t` (signaux)

```c
// main.c:31
static volatile sig_atomic_t g_running = 1;

static void on_sigint(int sig) {
    (void)sig;
    g_running = 0;
}
```

Quand tu fais `Ctrl+C`, le kernel envoie `SIGINT`. `on_sigint` est exécuté **dans le contexte du signal** — un truc qui peut interrompre n'importe quoi. Les seules opérations sûres dans un handler sont la lecture/écriture d'un `sig_atomic_t`.

- `volatile` : dit au compilo "ne mets pas cette variable en cache dans un registre, relis-la depuis la mémoire à chaque accès". Sans ça, ta boucle `while(g_running)` pourrait être optimisée en `while(1)`.
- `sig_atomic_t` : un type entier dont la lecture/écriture est garantie atomique (jamais à moitié écrite).

C'est le seul motif qui justifie `volatile` dans ce projet. **Ne mets pas `volatile` partout** par superstition — c'est très souvent inutile et peut désactiver des optimisations légitimes.

### 2.8 Endianness — `htons` / `htonl`

```c
local_addr.sin_port = htons((uint16_t)local_port);
local_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
```

Le réseau est en **big-endian** (octet de poids fort en premier). Ton CPU (Intel/ARM) est probablement en **little-endian**. `htons` = "host to network short", `htonl` = "host to network long". Toujours convertir quand tu touches une struct `sockaddr`. Le détail est dans le doc protocole.

---

## 3. `main.c` — Le cycle de vie

Ouvre `apps/firmware/src/main.c`. C'est 116 lignes, je te déroule la pensée.

### 3.1 Constantes et globales

```c
// main.c:24-29
#define BACKEND_HOST   "127.0.0.1"
#define BACKEND_PORT   5001        // TM downlink
#define LOCAL_TC_PORT  5002        // TC uplink
#define TICK_PERIOD_MS 100         // 10 Hz
#define DT_SEC         (TICK_PERIOD_MS / 1000.0)
#define TC_BUF_SIZE    256u
```

Tout est `#define` — c'est une substitution textuelle pré-compilation. Pas de `const` parce qu'historiquement les `#define` permettent de mieux choisir leur représentation (l'optimiseur peut tout inliner). Choix de style ; les deux marchent.

### 3.2 Le signal handler

```c
// main.c:31-36
static volatile sig_atomic_t g_running = 1;

static void on_sigint(int sig) {
    (void)sig;
    g_running = 0;
}
```

Le `(void)sig` ignore explicitement l'argument inutilisé — sans ça, `-Wunused-parameter` te ferait planter le build. C'est un idiome partout en C.

### 3.3 `sleep_ms`

```c
// main.c:38-43
static void sleep_ms(long ms) {
    struct timespec ts;
    ts.tv_sec  = ms / 1000;
    ts.tv_nsec = (ms % 1000) * 1000000L;
    nanosleep(&ts, NULL);
}
```

`nanosleep` est l'API POSIX standard pour dormir avec précision sub-seconde. `struct timespec` a deux champs : secondes + nanosecondes. Pour 100 ms tu mets `tv_sec=0, tv_nsec=100_000_000`.

### 3.4 La boucle principale

```c
// main.c:72-110 (raccourci)
while (g_running) {
    sm_tick(&sm);                                     // 1. avancer la state machine

    ssize_t n = net_recv_nonblock(tc_buf, sizeof tc_buf);
    if (n > 0) {
        // 2. décoder, exécuter, ack
    }

    physics_tick(&phys, sm.mode, DT_SEC);             // 3. simuler la physique

    size_t pkt_len = telemetry_compose_hk(tm_buf, ..., ...);  // 4. composer le paquet HK
    if (pkt_len > 0) (void)net_send(tm_buf, pkt_len);          // 5. l'envoyer

    sleep_ms(TICK_PERIOD_MS);                          // 6. attendre 100ms
}
```

Cinq étapes par tick, à 10 Hz. La structure est ce que tu trouverais dans n'importe quel flight software simple : **un super-loop polling**, pas d'interruptions, pas de threads.

> **Pourquoi pas `select()` / `poll()` / `epoll` ?**
> À 10 Hz avec un seul socket, le polling non-bloquant est **plus simple** et tout aussi efficace. `select()` aurait du sens si on avait plusieurs sources à surveiller simultanément (UART + socket + timer hardware). Ici on en a une, on poll en début de tick, point. Sache juste que `select()` existe au cas où on te le demande.

> **Pourquoi pas un thread RT séparé pour le timing ?**
> Parce que la spec dit "10 Hz nominal", pas "10 Hz à la nanoseconde près". Le `sleep_ms` dérive un peu — c'est OK pour ce qu'on fait. Sur du vrai vol on utiliserait un timer hardware qui réveille périodiquement la boucle (mode "tick interrupt"). Ici on simule sur Linux donc on utilise les outils Linux.

### 3.5 La séquence init

```c
// main.c:46-71
fprintf(stderr, "[BOOT] apogee firmware v0.3.0\n");

if (net_init(BACKEND_HOST, BACKEND_PORT, LOCAL_TC_PORT) != 0) {
    fprintf(stderr, "[FAULT] net_init failed\n");
    return EXIT_FAILURE;
}

signal(SIGINT,  on_sigint);
signal(SIGTERM, on_sigint);

StateMachine sm;
PhysicsState phys;
uint8_t      tm_buf[APOGEE_HK_PACKET_SIZE];   // 40B
uint8_t      ack_buf[APOGEE_ACK_FAIL_SIZE];   // 22B
uint8_t      tc_buf[TC_BUF_SIZE];             // 256B

sm_init(&sm);
physics_init(&phys);
```

Toutes les buffers sont **alloués sur la pile**. Une fois `main` actif, ils existent jusqu'à la sortie. Aucune surprise possible.

### 3.6 La sortie propre

```c
// main.c:112-115
fprintf(stderr, "[SHUTDOWN] mode=%s ticks=%u\n",
        sm_mode_name(sm.mode), sm.total_ticks);
net_close();
return EXIT_SUCCESS;
```

`net_close` libère le file descriptor du socket. Pas critique sous Linux (le kernel le ferait quand même), mais c'est propre et c'est ce qu'on ferait sur un vrai système.

---

## 4. `net.c` — Sockets POSIX UDP

L'API socket POSIX a 40 ans, 5 fonctions à connaître, et c'est tout. Tu n'as **jamais** besoin de plus de ça pour faire de l'UDP.

### 4.1 Création du socket

```c
// net.c:16-20
sock_fd = socket(AF_INET, SOCK_DGRAM, 0);
if (sock_fd < 0) {
    perror("[NET] socket");
    return -1;
}
```

- `AF_INET` : famille IPv4 (`AF_INET6` pour IPv6).
- `SOCK_DGRAM` : datagrammes — c'est de l'UDP. (`SOCK_STREAM` = TCP.)
- Le 3ème paramètre `0` laisse le système choisir le protocole par défaut (UDP pour DGRAM, TCP pour STREAM).
- Retour : un **file descriptor** (un entier ≥ 0). Sous Unix tout est fichier, y compris une socket.

`perror` imprime le message d'erreur correspondant à `errno`. C'est le `console.error` du C, en plus rustique.

### 4.2 Bind local — l'astuce du fd partagé

```c
// net.c:22-34
struct sockaddr_in local_addr;
memset(&local_addr, 0, sizeof local_addr);
local_addr.sin_family      = AF_INET;
local_addr.sin_port        = htons((uint16_t)local_port);
local_addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
if (bind(sock_fd, (const struct sockaddr *)&local_addr,
         sizeof local_addr) < 0) {
    perror("[NET] bind");
    ...
}
```

Le `bind` attache notre socket au port **5002** (`LOCAL_TC_PORT`) sur localhost. C'est **le port d'écoute des telecommandes** : le backend enverra ses TC vers `127.0.0.1:5002`.

Le `memset(..., 0, sizeof ...)` met toute la struct à zéro avant qu'on remplisse les champs utiles. **Toujours faire ça** — sinon des champs `sockaddr_in` non initialisés peuvent traîner du gargage qui fait planter le bind.

> **Pourquoi un seul socket pour send + receive ?**
> Sous UDP, un socket peut envoyer **vers n'importe quelle adresse** via `sendto(fd, data, len, 0, &remote_addr, ...)` indépendamment de son bind local. Le `bind` ne fixe que **l'adresse de réception**. Donc on bind sur 5002 (pour recevoir TC) et on `sendto` vers 5001 (pour envoyer TM) sur le **même fd**. C'est le pattern classique d'un endpoint UDP bidirectionnel.

### 4.3 Mode non-bloquant

```c
// net.c:36-43
int flags = fcntl(sock_fd, F_GETFL, 0);
if (flags < 0 || fcntl(sock_fd, F_SETFL, flags | O_NONBLOCK) < 0) {
    perror("[NET] fcntl O_NONBLOCK");
    ...
}
```

Par défaut, un `recvfrom` **bloque** jusqu'à ce qu'un paquet arrive. Si on faisait ça à chaque tick, le firmware se figerait dès qu'il n'y a pas de TC à lire.

`fcntl(F_SETFL, ... | O_NONBLOCK)` modifie le flag du fd : maintenant `recvfrom` retourne immédiatement avec `errno = EAGAIN` si rien n'est dispo. C'est **exactement** ce qu'on veut pour un super-loop.

### 4.4 Adresse du backend

```c
// net.c:45-53
memset(&backend_addr, 0, sizeof backend_addr);
backend_addr.sin_family = AF_INET;
backend_addr.sin_port   = htons((uint16_t)remote_port);
if (inet_pton(AF_INET, remote_host, &backend_addr.sin_addr) <= 0) {
    perror("[NET] inet_pton");
    ...
}
```

`inet_pton` (presentation to network) convertit `"127.0.0.1"` en sa représentation binaire 32 bits. La struct `backend_addr` est conservée en globale (privée du module via `static` ligne 13) — pas besoin de la reconstruire à chaque envoi.

### 4.5 Envoyer

```c
// net.c:57-67
int net_send(const void *data, size_t len) {
    if (sock_fd < 0) return -1;
    ssize_t sent = sendto(sock_fd, data, len, 0,
                          (const struct sockaddr *)&backend_addr,
                          sizeof backend_addr);
    if (sent < 0) {
        perror("[NET] sendto");
        return -1;
    }
    return 0;
}
```

`sendto` avec l'adresse remote dans le 5ème argument. C'est tout — **un appel système, un paquet UDP émis** (ou pas, mais on ne peut rien faire de plus sur UDP : c'est best-effort).

### 4.6 Recevoir non-bloquant

```c
// net.c:69-78
ssize_t net_recv_nonblock(void *buf, size_t max_len) {
    if (sock_fd < 0) return -1;
    ssize_t n = recvfrom(sock_fd, buf, max_len, 0, NULL, NULL);
    if (n < 0) {
        if (errno == EAGAIN || errno == EWOULDBLOCK) return 0;
        perror("[NET] recvfrom");
        return -1;
    }
    return n;
}
```

Retourne `> 0` (octets reçus), `0` (rien à lire), `< 0` (vraie erreur). Le `EAGAIN`/`EWOULDBLOCK` est le code "pas de paquet pour l'instant" — on le traduit en `0` pour le caller. Les deux constantes sont identiques sur Linux mais distinctes en théorie POSIX, donc on teste les deux par paranoïa.

---

## 5. `state_machine.c` — Pattern enum + switch

Une state machine en C c'est : un `enum` + une variable courante + une fonction de transition. Pas de classe, pas de polymorphisme. C'est tout simple.

### 5.1 Les modes

```c
// telemetry.h:11-17
typedef enum {
    APOGEE_MODE_SAFE    = 0,
    APOGEE_MODE_NOMINAL = 1,
    APOGEE_MODE_COMMS   = 2,
    APOGEE_MODE_FAULT   = 3,
    APOGEE_MODE_BOOT    = 4,
} ApogeeMode;
```

Les valeurs numériques sont **fixées explicitement** parce qu'elles partent sur le fil (octet 0 du payload HK). Si tu rajoutes un mode entre SAFE et NOMINAL, tu casses la wire. Donc on ajoute toujours **à la fin**.

### 5.2 Table de noms

```c
// state_machine.c:8-14
static const char *MODE_NAMES[] = {
    [APOGEE_MODE_SAFE]    = "SAFE",
    [APOGEE_MODE_NOMINAL] = "NOMINAL",
    [APOGEE_MODE_COMMS]   = "COMMS",
    [APOGEE_MODE_FAULT]   = "FAULT",
    [APOGEE_MODE_BOOT]    = "BOOT",
};
```

C'est la syntaxe C99 des **designated initializers** : `[index] = value`. Ça évite de dépendre de l'ordre des cases. Si tu réordonnes l'enum demain, le tableau reste correct.

### 5.3 La transition

```c
// state_machine.c:48-88 (raccourci)
bool sm_request_mode(StateMachine *sm, ApogeeMode requested) {
    if (requested == APOGEE_MODE_BOOT) return false;
    if (sm->mode == APOGEE_MODE_BOOT) return false;

    if (sm->mode == APOGEE_MODE_SAFE) {
        if (requested == APOGEE_MODE_NOMINAL ||
            requested == APOGEE_MODE_SAFE ||
            requested == APOGEE_MODE_FAULT) {
            enter_mode(sm, requested);
            return true;
        }
        return false;
    }
    // ... autres états ...
}
```

> **Pourquoi la state machine décide elle-même d'accepter ou refuser, plutôt que le caller ?**
> Parce que c'est elle qui connaît les règles. Si le caller (ici `command.c`) devait connaître les transitions valides, ces règles seraient dupliquées ailleurs aussi (UI, tests, etc.). Le principe : **les invariants vivent avec leur owner**. Le caller envoie une requête, la SM répond oui ou non. C'est aussi plus testable.

> **Pourquoi BOOT ne peut pas être demandé manuellement ?**
> Parce que BOOT est une condition transitoire post-power-up. Elle dure 2 s puis transitionne automatiquement vers SAFE (`state_machine.c:43-45`). L'opérateur ne devrait jamais avoir à dire "rebascule en BOOT" — pour ça il a `REBOOT` (qui re-init complètement). Garde-fou pour éviter qu'un opérateur foutraque déstabilise le satellite.

### 5.4 Le tick

```c
// state_machine.c:39-46
void sm_tick(StateMachine *sm) {
    sm->total_ticks++;
    sm->tick_in_mode++;
    if (sm->mode == APOGEE_MODE_BOOT && sm->tick_in_mode >= BOOT_TICKS) {
        enter_mode(sm, APOGEE_MODE_SAFE);
    }
}
```

C'est tout. La seule transition automatique est BOOT → SAFE après 20 ticks (`BOOT_TICKS=20` à 10 Hz = 2 s). Le reste est pilote-driven.

---

## 6. `physics.c` — Simulation paramétrique

L'objectif n'est pas la fidélité physique mais la **vraisemblance**. Donc on paramétrise plutôt que d'intégrer.

### 6.1 La struct d'état

```c
// physics.h:11-25
typedef struct {
    uint16_t battery_mv;
    double  orbit_t_sec;
    int32_t lat_e7;
    int32_t lon_e7;
    uint32_t alt_m;
    int16_t roll10;
    int16_t pitch10;
    int16_t yaw10;
} PhysicsState;
```

Tout est dimensionné comme la wire :
- `battery_mv` en millivolts (`uint16_t` : jusqu'à 65 V, large pour un CubeSat)
- `lat_e7` / `lon_e7` : degrés × 10⁷ dans un `int32_t`
- `alt_m` : mètres en `uint32_t`
- `rollN` / `pitchN` / `yawN` : degrés × 10 dans un `int16_t` (donc précision 0.1°)

Le seul double est `orbit_t_sec` parce qu'on en a besoin en interne pour les fonctions trig.

### 6.2 Le calcul d'orbite

```c
// physics.c:62-90 (raccourci)
static void update_orbit(PhysicsState *p) {
    double u = 2.0 * M_PI * (p->orbit_t_sec / ORBIT_PERIOD_S);
    double lat_deg = ORBIT_INC_DEG * sin(u);
    double lon_inertial = (360.0 * p->orbit_t_sec / ORBIT_PERIOD_S);
    double earth_rot = (360.0 * p->orbit_t_sec / EARTH_DAY_S);
    double lon_deg = lon_inertial - earth_rot;
    lon_deg = fmod(lon_deg + 540.0, 360.0) - 180.0;
    p->lat_e7 = (int32_t)(lat_deg * 1e7);
    p->lon_e7 = (int32_t)(lon_deg * 1e7);
    ...
}
```

C'est de la trigonométrie de lycée :
- `u` = anomalie moyenne, fraction du tour orbital × 2π
- Latitude : `inclinaison × sin(u)` — projection grossière d'une orbite circulaire inclinée
- Longitude : avance inertielle (le satellite tourne) **moins** la rotation de la Terre sous-jacente
- Le `fmod(... + 540, 360) - 180` ramène la longitude dans `[-180, 180]`

> **C'est pas du J2 / SGP4 / vraie physique ?**
> Non, et c'est volontaire. Apogée a la **vraie** propagation SGP4 dans le frontend (Web Worker, paquet `satellite.js`) pour les satellites Celestrak. Le firmware lui simule **son propre** CubeSat avec une physique-jouet. Sur un projet de portfolio, mélanger les deux serait une erreur de scope.

### 6.3 Le truc du "× 10⁷"

Pourquoi multiplier la latitude par 10 millions et la stocker dans un `int32_t` au lieu de transmettre un `double` (8 octets) ?

| Encodage | Taille wire | Précision | CPU pour décoder |
|---|---|---|---|
| `double` | 8 B | ~10⁻¹⁵ ° | float<br>(absurde pour la géo) |
| `float` | 4 B | ~10⁻⁷ ° | float |
| `int32_t * 1e7` | 4 B | 10⁻⁷ ° (= 1.1 cm) | entier, trivial |

Même précision que le float, **même taille**, mais entièrement entier sur la wire. Pas de NaN, pas de 0.1+0.2 ≠ 0.3, pas de subnormales. C'est **la** convention en télémétrie spatiale (et c'est ce qu'utilise Mavlink, le protocole drone, par exemple).

---

## 7. `crc16.c` — La petite fonction qui sauve

```c
// crc16.c:3-16
uint16_t crc16_ccitt(const uint8_t *data, size_t len) {
    uint16_t crc = 0xFFFFu;
    for (size_t i = 0; i < len; i++) {
        crc ^= (uint16_t)((uint16_t)data[i] << 8);
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

13 lignes. Implémente **CRC-16/CCITT-FALSE**, le standard CCSDS. Pour la théorie, va voir le doc protocole — ici juste retiens que :
- Boucle sur chaque octet, on l'XORe dans le high byte du CRC.
- Boucle de 8 itérations qui shift le CRC d'un bit, et XORe avec le polynôme `0x1021` si le bit qui sort est à 1.
- Init à `0xFFFF`, pas de réflexion, pas de XOR final.

Cette implémentation est **bit-by-bit** : 8 itérations par octet. Lente mais simple. Sur du vrai vol on utiliserait une table de lookup 256 entrées (256× plus rapide). Ici on peut se le permettre — 40 octets × 8 bits = 320 itérations par paquet à 10 Hz, c'est rien.

---

## 8. Pour aller plus loin

Si tu veux étendre ou défendre ce code, voilà des sujets qui te seront posés :

### 8.1 Compiler en mode strict

```bash
cd apps/firmware
make clean
CFLAGS="-std=c11 -Wall -Wextra -Werror -Wpedantic -Wshadow -Wconversion -O2 -g3" make
```

`-Wshadow` détecte les variables qui en cachent d'autres, `-Wconversion` les casts implicites suspects. Le code Apogée passe sans `-Wconversion` mais le rajouter t'apprendra plein de choses.

### 8.2 Debug avec `gdb`

```bash
make CFLAGS="-O0 -g3" run
# dans un autre terminal:
gdb -p $(pidof apogee_fw)
(gdb) break sm_request_mode
(gdb) continue
(gdb) print *sm
```

Le `-O0 -g3` désactive l'optimisation et active les symboles de debug — sinon `gdb` te montre du code réorganisé.

### 8.3 Détecter les leaks et out-of-bounds

```bash
valgrind --error-exitcode=1 ./build/apogee_fw
```

Le firmware n'alloue rien dynamiquement, donc `valgrind` ne devrait jamais rapporter de leak. **S'il en rapporte un, c'est un bug**. Utile aussi pour détecter les lectures/écritures hors-bornes.

### 8.4 Porter sur STM32 (théorique)

Ce qui changerait :
- `nanosleep` → un timer hardware (TIM) avec interruption qui réveille la loop
- `socket(AF_INET, ...)` → drivers UART/CAN/SpaceWire selon le sous-système
- `clock_gettime` → un compteur libre roulant + offset GPS
- `fprintf(stderr, ...)` → ITM (debug trace via SWO) ou rien
- Le reste (state machine, physics, ccsds, telemetry, command) **reste identique**.

C'est **pour ça** qu'on a séparé les modules. La couche `net.c` est la seule à parler POSIX.

---

## Fin

Une fois ce doc digéré, va lire [`COURS_COMMS_PROTOCOLE.md`](COURS_COMMS_PROTOCOLE.md) pour le format binaire CCSDS/PUS — c'est l'autre moitié du puzzle. À deux, ces deux docs te couvrent tout ce qu'il faut savoir pour défendre le firmware en entretien ou en démo.
