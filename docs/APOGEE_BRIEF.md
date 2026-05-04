# Apogée — Mini Mission Control pour CubeSat

> Brief projet destiné à Claude Code. À lire en premier.

## 1. Vision et objectifs

**Apogée** est un mini centre de contrôle de mission satellite, à la fois portfolio personnel et plateforme d'apprentissage du domaine spatial. L'app affiche en 3D la position en temps réel de vrais satellites en orbite (ISS, Starlink, etc.) **et** d'un CubeSat virtuel dont le firmware tourne réellement en C, communique par socket avec le backend, et peut être commandé depuis le dashboard.

**Pourquoi ce projet existe :**
- Démontrer une compétence cross-domaine : full-stack web (React/TS/Node) + flight software (C) + sécurité applicative.
- Construire un portfolio crédible pour postuler chez des boîtes spatiales françaises (Look Up Space, CLS, CS Group, Thales Alenia Space, Airbus DS).
- Apprendre les patterns réels du flight software (state machine, télémétrie binaire, MISRA C) dans un environnement contrôlé.

**Ce projet n'est PAS :**
- Un produit destiné à de vrais opérateurs satellites.
- Une simulation physique haute-fidélité (pas besoin de modèles d'attitude rigoureux, perturbations J2, etc.).
- Un système avec radio réelle ou matériel embarqué (tout reste software, hardware-in-the-loop possible plus tard mais hors scope MVP).

**Profil utilisateur unique** : Charles, dev full-stack avec master en sécurité applicative, basé à Bessan (Hérault). Bonne maîtrise React/TS/Node/PHP. Apprend le C en parallèle via firmware embarqué. Communique en français, code en anglais.

---

## 2. Architecture globale

Quatre composants, communication unidirectionnelle ou bidirectionnelle selon les paires.

```
┌────────────────────────────────────────────┐
│   Frontend (Dashboard mission control)     │
│   React + TypeScript + Cesium 3D globe     │
└────────────────────┬───────────────────────┘
                     │ WebSocket (JSON)
┌────────────────────┴───────────────────────┐
│   Backend (Node.js bridge)                 │
│   Express + ws + couche sécu               │
└──────────┬───────────────────────┬─────────┘
           │ HTTP (TLE refresh)     │ UDP localhost (binaire)
           │                        │
┌──────────┴──────────┐  ┌──────────┴──────────┐
│  Satellites réels   │  │  CubeSat simulé     │
│  Celestrak + SatNOGS│  │  Firmware C autonome│
└─────────────────────┘  └─────────────────────┘
```

**Flux de données principaux :**
1. Backend pull les TLE Celestrak toutes les 6h, les met en cache.
2. Frontend reçoit les TLE par WebSocket au connect, propage localement via satellite.js (SGP4).
3. Firmware C tourne en boucle continue, émet des paquets télémétrie binaires en UDP vers le backend toutes les 100ms.
4. Backend décode la télémétrie, la convertit en JSON, la pousse au frontend par WebSocket.
5. Commandes utilisateur : Frontend → Backend (JSON WebSocket) → Firmware C (binaire UDP).

---

## 3. Stack technique

### Frontend
- **React 18+** avec **TypeScript strict** (`strict: true` dans tsconfig)
- **Vite** comme bundler (pas Create React App)
- **CesiumJS** ou **Resium** (wrapper React de Cesium) pour le globe 3D
- **satellite.js** pour la propagation SGP4 côté client
- **Tailwind CSS** pour le style (look "mission control" sombre, vert/orange CRT en option)
- **Zustand** ou **Jotai** pour le state management (pas de Redux, overkill ici)

### Backend
- **Node.js 20+** avec **TypeScript**
- **Express** pour les routes HTTP
- **ws** pour WebSocket (pas socket.io, on veut du protocole standard)
- **node-cron** pour le refresh TLE planifié
- **dgram** (natif Node) pour UDP avec le firmware C
- **zod** pour la validation des messages
- Pas de base de données pour le MVP. Cache en mémoire.

### Firmware C
- **C99 ou C11**, compilé avec `gcc -Wall -Wextra -Wpedantic -std=c11`
- **Pas de malloc/free** : allocation statique uniquement (préparation aux contraintes flight software)
- **Make** pour le build (pas CMake, gardons simple)
- **Aucune dépendance externe** hors libc et POSIX sockets
- Lint avec **cppcheck** en mode MISRA si possible

### Outils transverses
- **pnpm** pour le monorepo workspace
- **ESLint** + **Prettier** pour le JS/TS
- **GitHub Actions** pour CI basique (lint + build)

---

## 4. Roadmap par phases

### MVP — Phase 1 (objectif : 1-2 weekends)

**Livrable :** un globe 3D dans le navigateur affichant 10-20 satellites réels (ISS, Hubble, quelques Starlink, GPS) qui se déplacent en temps réel.

- Setup monorepo (`apps/web`, `apps/server`, `apps/firmware`)
- Backend : endpoint `GET /api/satellites` qui renvoie les TLE depuis Celestrak (cache 6h)
- Backend : WebSocket basique qui pousse les TLE au connect
- Frontend : globe Cesium centré sur la Terre
- Frontend : propagation satellite.js et affichage des positions à 1 Hz
- Pas encore de firmware C, pas encore de commandes

### V1 — Phase 2 (objectif : 1 mois)

**Livrable :** ajout du CubeSat simulé qui apparaît sur le globe, avec télémétrie live et commandes basiques.

- Firmware C : state machine 5 modes (BOOT, SAFE, NOMINAL, COMMS, FAULT)
- Firmware C : modèle batterie et orbite képlérienne simplifiée
- Firmware C : émission télémétrie binaire UDP à 10 Hz
- Backend : décodeur de paquets télémétrie, validation CRC
- Backend : router de commandes (validation puis forward UDP au firmware)
- Frontend : panneau télémétrie live (batterie, mode, attitude)
- Frontend : 3 commandes UI (PING, SET_MODE, REBOOT)
- Frontend : CubeSat visible sur le globe avec sa propre orbite

### V2 — Phase 3 (objectif : mois 2-3)

**Livrable :** couche sécurité et détection d'anomalies.

- Backend : signature HMAC des commandes (clé partagée firmware/backend)
- Backend : détecteur d'anomalies stats sur la télémétrie (z-score sur fenêtres glissantes)
- Backend : alertes (drift batterie, mode imprévu, télémétrie manquante)
- Frontend : dashboard sécurité avec timeline des alertes
- Mode "attaque" pour démonstration : un script qui injecte de la télémétrie falsifiée ou des commandes non signées, doit être détecté

### V3 — Phase 4 (optionnel, "wow factor")

**Livrable :** intégration SatNOGS et hardware-in-the-loop.

- Intégration API SatNOGS DB pour métadonnées radio des satellites
- Affichage des passes prédites au-dessus de la position de l'utilisateur
- Option : compilation cross du firmware C pour Raspberry Pi avec LEDs reflétant le mode courant
- Option : capture de vraie télémétrie SatNOGS et rejeu dans Apogée

---

## 5. Spécifications du firmware C

### State machine

États :
- `BOOT` — initialisation, transition automatique vers SAFE après 2s
- `SAFE` — mode dégradé minimal (uniquement télémétrie de base, pas de commandes sauf SET_MODE)
- `NOMINAL` — mode opérationnel, toutes commandes acceptées
- `COMMS` — mode communications privilégiées (placeholder, V1+)
- `FAULT` — état d'erreur, transition manuelle uniquement vers SAFE

Transitions :
- Toute transition est loggée (printf vers stderr, pas d'écriture fichier en MVP)
- Aucune transition automatique entre NOMINAL et FAULT en MVP (FAULT entré uniquement par commande de test)

### Boucle principale (tick)

Boucle à 10 Hz (100 ms par tick). Chaque tick fait dans l'ordre :
1. Lire les commandes UDP entrantes (non-bloquant, `recvfrom` avec timeout 0)
2. Mettre à jour le modèle physique (batterie, orbite, attitude)
3. Composer un paquet télémétrie
4. Envoyer le paquet UDP au backend
5. Sleep jusqu'au prochain tick

### Format des paquets télémétrie (binaire, little-endian)

```c
typedef struct __attribute__((packed)) {
    uint16_t magic;          // 0xAB1E (Apogée Beacon)
    uint8_t  version;        // 0x01
    uint8_t  mode;           // SAFE=0, NOMINAL=1, COMMS=2, FAULT=3, BOOT=4
    uint32_t tick_count;     // depuis BOOT
    uint64_t timestamp_us;   // microsecondes Unix
    int32_t  lat_e7;         // latitude * 1e7
    int32_t  lon_e7;         // longitude * 1e7
    uint32_t alt_m;          // altitude en mètres
    uint16_t battery_mv;     // tension batterie en mV
    int16_t  attitude_deg[3];// roll, pitch, yaw en degrés * 10
    uint8_t  reserved[4];
    uint16_t crc16;          // CRC-16-CCITT sur tous les octets précédents
} TelemetryPacket;
// Taille totale : 40 octets
```

### Format des commandes (binaire entrant, little-endian)

```c
typedef struct __attribute__((packed)) {
    uint16_t magic;          // 0xC0DE (Apogée Command)
    uint8_t  version;        // 0x01
    uint8_t  command_id;     // PING=1, SET_MODE=2, REBOOT=3
    uint8_t  payload[8];     // dépend du command_id
    uint8_t  hmac[8];        // HMAC-SHA256 tronqué (8 premiers octets) — V2 uniquement
    uint16_t crc16;
} CommandPacket;
// Taille totale : 22 octets
```

### Contraintes de code C

- **Allocation statique uniquement.** Pas de `malloc`, `calloc`, `realloc`, `free`. Tous les buffers sont des tableaux de taille fixe en `.bss` ou `.data`.
- **Aucune récursion.** Tout est itératif.
- **Tous les retours d'appels système vérifiés.** `recvfrom`, `sendto`, `clock_gettime` etc.
- **Aucun `printf` dans la boucle nominale.** Logs uniquement aux transitions d'état ou erreurs. Préfixer par `[BOOT]`, `[SAFE]`, etc.
- **Conventions de nommage :** `snake_case` pour fonctions et variables, `UPPER_SNAKE` pour les constantes, `PascalCase` pour les types.
- **Pas de variables globales mutables** sauf le state machine principal et les buffers d'I/O. Tout le reste est passé par paramètres.

### Structure de fichiers du firmware

```
apps/firmware/
├── Makefile
├── README.md
├── src/
│   ├── main.c              # entry point + main loop
│   ├── state_machine.c/.h  # transitions et état courant
│   ├── telemetry.c/.h      # composition et envoi des paquets
│   ├── commands.c/.h       # parsing et exécution des commandes
│   ├── physics.c/.h        # modèle batterie, orbite, attitude
│   ├── crc16.c/.h          # CRC-16-CCITT
│   ├── hmac.c/.h           # HMAC-SHA256 pour V2
│   └── net.c/.h            # wrapper UDP
└── tests/
    └── test_crc.c          # tests unitaires basiques
```

---

## 6. Spécifications du backend

### Routes HTTP

- `GET /api/satellites` — renvoie les TLE depuis le cache, refresh si > 6h
- `GET /api/health` — healthcheck (status, uptime, dernière maj TLE, état du firmware)
- `POST /api/command` — accepte une commande JSON, la signe, l'envoie en UDP au firmware

### WebSocket

Endpoint : `ws://localhost:3001/ws`

Messages serveur → client (JSON) :
- `{ type: "tle_bundle", payload: [...] }` — au connect
- `{ type: "telemetry", payload: { mode, lat, lon, alt, battery_v, attitude } }` — à chaque paquet reçu du firmware
- `{ type: "alert", payload: { severity, message, timestamp } }` — V2

Messages client → serveur (JSON) :
- `{ type: "command", payload: { command_id, args } }` — relayé vers le firmware

### Communication avec le firmware

- UDP localhost, ports : `5001` (firmware → backend), `5002` (backend → firmware)
- Le backend valide systématiquement le magic, la version, et le CRC avant traitement.

---

## 7. Spécifications du frontend

### Layout

Trois zones principales :
- **Globe central** (Cesium) — 70% de l'écran, affiche la Terre avec satellites mobiles
- **Panneau gauche** — liste des satellites visibles, filtres (catégories, altitude)
- **Panneau droit** — télémétrie temps réel du CubeSat simulé, graphiques (batterie, attitude)
- **Barre du bas** — console commandes + log d'événements

Esthétique : sombre, monospace pour la télémétrie, accent vert ou ambre style mission control NASA des années 60-70. Pas de skeuomorphisme excessif, on reste flat moderne.

### State management

- Un store global (Zustand) pour : connexion WebSocket, liste des satellites, télémétrie courante, alertes
- Le calcul SGP4 se fait dans un Web Worker pour ne pas bloquer le rendu

---

## 8. Sources de données externes

### Celestrak (gratuit, sans clé)
- Base : `https://celestrak.org/NORAD/elements/`
- Format JSON pour les groupes : `?GROUP=stations&FORMAT=json`
- Refresh : toutes les 6 heures côté backend

### SatNOGS DB (gratuit, sans clé) — V3 uniquement
- Base : `https://db.satnogs.org/api/`
- Endpoints utiles : `/satellites/`, `/transmitters/`

### N2YO (optionnel, clé gratuite)
- Pour les passes prédites au-dessus d'une position donnée
- 1000 req/heure en free tier

---

## 9. Structure du monorepo

```
apogee/
├── README.md
├── package.json            # workspace root
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                # frontend React/TS
│   │   ├── src/
│   │   ├── public/
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── server/             # backend Node/TS
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── firmware/           # firmware C
│       ├── src/
│       ├── tests/
│       └── Makefile
├── packages/
│   └── shared-types/       # types TypeScript partagés
└── docs/
    ├── architecture.md
    ├── telemetry-format.md
    └── command-protocol.md
```

---

## 10. Conventions de code

- **Commentaires en anglais** dans le code, **READMEs en français** OK
- **Pas de console.log en production** — logger structuré (pino côté Node, custom léger côté C)
- **Conventional commits** : `feat:`, `fix:`, `docs:`, `refactor:`
- **Branches** : `main` stable, feature branches `feat/nom-de-feature`
- **TypeScript** : strict, `noImplicitAny`, pas de `any` sauf justifié par commentaire
- **C** : `gcc -Wall -Wextra -Werror -Wpedantic`, build doit passer sans warning

---

## 11. Hors scope (à ne PAS implémenter)

- Authentification utilisateur (app local, mono-utilisateur)
- Multi-utilisateurs ou collaboration
- Persistance long-terme des données (pas de DB en MVP/V1)
- Vraie radio, vraie réception de signaux satellites
- Modèles physiques rigoureux (perturbations J2, traînée atmosphérique précise, etc.)
- Déploiement cloud (tourne en local sur la machine du dev)
- Tests E2E exhaustifs (tests unitaires sur les parties critiques suffisent)
- Internationalisation (interface en français OK, pas besoin de i18n)

---

## 12. Glossaire

- **TLE** (Two-Line Element) — format texte standard décrivant une orbite satellite
- **SGP4** — algorithme de propagation orbitale standard utilisé avec les TLE
- **NORAD ID** — identifiant numérique unique d'un objet en orbite
- **Segment sol** — partie au sol d'un système spatial (stations, mission control, traitement données)
- **Flight software** — logiciel embarqué à bord d'un satellite
- **CubeSat** — satellite miniature normalisé (1U = cube de 10cm)
- **Télémétrie** — données envoyées du satellite vers le sol décrivant son état
- **MISRA C** — sous-ensemble du C avec règles strictes pour les systèmes critiques
- **HITL** (Hardware-in-the-loop) — banc de test où le vrai firmware tourne sur du vrai hardware avec le reste simulé

---

## 13. Premier objectif concret pour Claude Code

Mettre en place le squelette du monorepo avec :
1. Configuration pnpm workspace
2. Application web Vite/React/TS qui affiche un globe Cesium vide centré sur la Terre
3. Backend Node/TS avec un endpoint `/api/health` qui répond `{ status: "ok" }`
4. README racine expliquant comment lancer le tout

Une fois ça en place et qui tourne, on attaquera l'intégration Celestrak puis le firmware C.
