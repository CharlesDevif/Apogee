# Apogée

> Mini centre de contrôle de mission CubeSat — **boucle bout-en-bout** : firmware C en allocation statique → CCSDS Space Packets sur UDP → backend Node → globe 3D Cesium temps réel + console opérateur.

[![Phase](https://img.shields.io/badge/phase-3.2-ffb700?style=flat-square)]() [![C](https://img.shields.io/badge/firmware-C11_static-7dffb1?style=flat-square)]() [![Stack](https://img.shields.io/badge/stack-React_19_·_TS_strict_·_Vite-04070a?style=flat-square)]() [![Protocol](https://img.shields.io/badge/protocol-CCSDS_133.0--B--2_+_PUS--C-7dffb1?style=flat-square)]() [![Auth](https://img.shields.io/badge/auth-HMAC--SHA--256_128b-ff4d3d?style=flat-square)]() [![Licence](https://img.shields.io/badge/licence-MIT-1c2c38?style=flat-square)]()

---

## Ce qui tourne aujourd'hui

- 🌍 **Globe 3D Cesium** centré sur l'Europe, ~35 satellites réels (ISS, Tiangong, Hubble, Crew Dragon, Landsat…) propagés via SGP4 dans un Web Worker dédié à 1 Hz, TLE rafraîchies depuis Celestrak toutes les 6 h.
- 🛰️ **CubeSat simulé `APOGÉE-1`** : firmware C autonome, state machine `BOOT → SAFE → NOMINAL → COMMS → FAULT`, orbite ISO-like (incl. 51.6°, période 92 min), gestion batterie, télémétrie **CCSDS Space Packet · PUS 3/25 housekeeping** à 10 Hz.
- 📡 **Backend Node** : pull TLE Celestrak, dispatch UDP par APID (HK / TC verification), encodage des télécommandes, broadcast WebSocket au frontend, vérification CRC-16-CCITT sur tout paquet.
- 🎯 **Tracking unifié** : `/` ouvre une barre de recherche fuzzy ; click sur un satellite → la caméra y vole, son orbite complète apparaît en pointillés phosphore, sa lat/lon/alt s'affiche en live.
- ⌨️ **Console opérateur target-aware** : click sur `APOGÉE-1` pour le "cibler" (▶ rouge sur le label), la console s'arrime en bas. Esc ou click ailleurs pour désélectionner. Bandeau d'état (mode, batterie, âge dernier TM, link, TC OK/FAIL/PEND), log filtrable avec UTC absolu + latency, REPL avec history (↑↓), tab complete. **Confirmation 2 étapes pour `reboot`** (ARMED → exécution). Console **redimensionnable** par drag du haut, taille mémorisée.
- 🔁 **Chaîne de commandes** UI → backend → firmware : `PING` (PUS 17/1), `SET_MODE` et `REBOOT` (PUS 8/1). Chaque TC reçoit un ack `PUS 1/1` (success) ou `1/2` (failure avec code mappé sur l'enum `CommandOutcome` du firmware).
- 🔐 **Authentification HMAC-SHA-256** (truncated 128b) sur chaque télécommande, vérifiée bord par comparaison constant-time. **Anti-replay** par compteur de séquence. Implémentation crypto C pure validée contre les vecteurs RFC 4231.
- 🔴 **Red team toolkit** : toggle BLUE OPS / RED TEAM dans la console. Packet crafter avec 5 attaques préconfigurées (REPLAY, STRIP_MAC, BIT_FLIP, CORRUPT_CRC, FORGE) qui injectent des bytes raw bypassant le signing — toutes rejetées par le firmware avec les bons codes (`BAD_HMAC`, `BAD_CRC`, `REPLAY`). Démontre la défense en profondeur.
- 🔬 **Packet Inspector** : click sur n'importe quelle ligne du log → panneau qui affiche **les vrais octets** capturés au moment du `sendto`/`recvfrom` (pas re-encodés), décodés en zones colorées (Primary Header / PUS-C / Payload / HMAC / CRC) avec hover synchronisé entre les champs nommés et le hex dump. Onglets séparés pour le TC et son ACK, plus un onglet `◆ ATTACK` en RED MODE.
- 🎨 **HUD mission control brutaliste** : phosphore CRT, scanlines, grain, brackets, typo *Major Mono Display* + *JetBrains Mono* — design system documenté, anti-AI-slop assumé.

## Démo en 30 secondes

```bash
git clone <repo> apogee && cd apogee
pnpm install
cp apps/server/.env.example apps/server/.env   # premier run uniquement
cp apps/web/.env.example apps/web/.env         # premier run uniquement
pnpm dev:all          # web :5173 + backend :3001 + firmware C
```

Ouvre <http://localhost:5173>.

1. Le globe se centre sur l'Europe, 35 satellites apparaissent et bougent.
2. Tape <kbd>/</kbd>, écris `iss`, ⏎ — la caméra zoom sur l'ISS, son orbite se trace.
3. Le point ambre `APOGÉE-1` apparaît, traverse l'Atlantique, l'Europe, l'Asie en quelques minutes.
4. Click sur `APOGÉE-1` → il devient ciblé (encadré rouge `TARGETED`), le panneau BEACON à droite affiche `MODE: SAFE`, `BATTERY: 7.40 V`, `LAST TM: 0.2s`, la console s'arrime en bas.
5. Dans la console : tape `nominal` <kbd>⏎</kbd> — TC#001 **signée HMAC-SHA-256** part, ACK OK ~10 ms après, le mode passe à `NOMINAL`.
6. Click sur la ligne du log TC — le packet inspector s'ouvre, les 30 octets exacts qui ont voyagé sur l'UDP s'affichent en zones colorées (Primary Header / PUS / Payload / HMAC / CRC).
7. Tape `reboot` <kbd>⏎</kbd> — ARMED 2 s, <kbd>⏎</kbd> à nouveau pour confirmer. Le firmware fait un fresh BOOT.
8. **Mode sécu** : toggle `RED TEAM` en haut à droite de la console, clique la ligne `SET_MODE NOMINAL` du log, onglet `◆ ATTACK`, choisis `STRIP_MAC` → preview → `INJECT`. Une nouvelle ligne rouge apparaît avec `ACK FAIL · BAD_HMAC` : le firmware a rejeté l'attaque.
9. Coupe le firmware (<kbd>Ctrl+C</kbd>) — le link passe `disconnected`, le point disparaît, `LAST TM` passe en `STALE`.

> 💡 Le dev server Vite expose aussi ton IP réseau (`http://<ton-ip>:5173`) — pratique pour montrer la démo à un collègue sur le même Wi-Fi sans déployer.

## Architecture

```
┌────────────────────────────────────────────┐
│   Frontend — Mission Control Dashboard     │
│   React 19 + TS strict + Vite + Cesium 3D  │
│   SGP4 dans Web Worker · Zustand state     │
│   Console opérateur · TC encoder/UI        │
└────────────────────┬───────────────────────┘
                     │ WebSocket JSON (tle, telemetry, command_sent, command_ack)
┌────────────────────┴───────────────────────┐
│   Backend — Node.js Bridge                 │
│   Express + ws · CCSDS encode/decode       │
│   APID dispatch · Celestrak cache 6h       │
└──────────┬───────────────────────┬─────────┘
           │ HTTPS (TLE refresh)    │ UDP localhost — CCSDS Space Packets
           │                        │  TM :5001 (HK 0x100, ACK 0x102)
           │                        │  TC :5002 (uplink 0x200)
┌──────────┴──────────┐  ┌──────────┴──────────┐
│  Satellites réels   │  │  CubeSat simulé     │
│  Celestrak · ISS    │  │  Firmware C11       │
│  Hubble · Starlink  │  │  Static alloc only  │
└─────────────────────┘  └─────────────────────┘
```

### Protocole filaire

Apogée parle **CCSDS Space Packet Protocol (133.0-B-2)** + un sous-ensemble **ECSS PUS-C** (services 1, 3, 8, 17). Big-endian, validé par CRC-16-CCITT. C'est ce que parlent YAMCS, OpenC3 COSMOS, NASA cFS, et la plupart des CubeSats institutionnels — **n'importe quel firmware tiers parlant CCSDS+PUS branche directement sur ce backend**.

| APID | Direction | Service | Usage |
|---|---|---|---|
| `0x100` | TM | PUS 3/25 | Housekeeping report (10 Hz, 40 B) |
| `0x102` | TM | PUS 1/1 ou 1/2 | TC verification ack |
| `0x200` | TC | PUS 17/1, 8/1 | PING, SET_MODE, REBOOT |

Détail bit-à-bit dans [`docs/PROTOCOL.md`](docs/PROTOCOL.md). Migration depuis l'ancien format custom : voir l'historique git autour de la phase 2.6.

## Pourquoi ce projet ?

Apogée est à la fois :

- **Un outil pédagogique** pour les équipes étudiantes CubeSat (Nanolab Academy, AMSAT-F, CSU) qui n'ont pas de stack segment-sol commun open-source.
- **Un banc de démo sécurité applicative** pour formations et conférences (DEF CON Aerospace Village, Ctrl+Space, CYSAT) : replay, tampering, HMAC strip, anomaly detection sur télémétrie CCSDS réelle (Phase 3).
- **Un terrain d'apprentissage flight software** : firmware C strict (`-Wall -Wextra -Werror -Wpedantic`), zéro `malloc`, zéro récursion, allocation statique uniquement, modules portables sans dépendance OS — tu prends `state_machine.c`, `physics.c`, `ccsds.c`, `telemetry.c`, `command.c` et tu les fais tourner sur un STM32 en réécrivant juste `net.c`.

## Stack technique

| Couche | Choix | Raison |
|---|---|---|
| Frontend | React 19 + TS strict + Vite 5 | Conventions React 19 modernes, ref-as-prop, pas de `forwardRef` |
| 3D | Cesium 1.122 + Resium | Standard de fait segment-sol (utilisé par Look Up Space, AGI) |
| Propagation | satellite.js (Web Worker) | SGP4 hors main thread, impossible de bloquer le rendu |
| State | Zustand sélecteurs fins | Pas de Redux, pas de Context monolithique |
| Style | Tailwind + tokens custom | Aucune sans-serif, aucun gradient pastel, brutaliste assumé |
| Backend | Node 20 + Express + ws | Standard, pas de DB en MVP/V1 |
| Firmware | C11 + Make + libc/POSIX | Discipline flight software, compilable sur Pi/STM32 |
| Protocole | CCSDS 133.0-B-2 + PUS-C | Standard ESA/NASA, interopérable YAMCS / OpenC3 / cFS |

## Roadmap

- [x] **Phase 0** — squelette monorepo, globe Cesium vide, `/api/health`
- [x] **Phase 1** — TLE Celestrak, propagation SGP4, satellites Terre temps réel, tracking + orbites
- [x] **Phase 2.1–2.5** — firmware C autonome, télémétrie binaire UDP, state machine, physics, CubeSat live sur le globe
- [x] **Phase 2.6** — migration CCSDS + PUS-C, chaîne de commandes UI → backend → firmware (PING, SET_MODE, REBOOT), TC verification (acks), console opérateur target-aware, packet inspector (vrais octets décodés en zones colorées)
- [x] **Phase 3.1** — Authentification HMAC-SHA-256 truncated 128b sur les TC, PSK 32o partagée firmware/backend, anti-replay seq-based, codes d'échec `BAD_HMAC` (10) + `REPLAY` (11)
- [x] **Phase 3.2** — RED MODE + packet crafter (REPLAY · STRIP_MAC · BIT_FLIP · CORRUPT_CRC · FORGE), endpoint backend `command_raw` qui bypasse le signing, distinction visuelle attaques dans le log
- [ ] **Phase 4** — *« Apogée Sim »* — digital twin web-based : J2 + drag atmosphérique, attitude dynamics, sun vector, IGRF, sensor/actuator emulation, scénarios + anomalies, upload de firmware user. Roadmap dans [`docs/APOGEE_SIM.md`](docs/APOGEE_SIM.md) (à venir)

## Conventions et docs

Avant de toucher au code, lire :

| Doc | Sujet |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Contrat opérationnel, stack figée, posture de collaboration |
| [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md) | Brief technique complet, archi, specs firmware/backend |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Tokens, primitives, anti-AI-slop, règles d'évolution |
| [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md) | React 19 moderne, TypeScript strict, anti-patterns |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | CCSDS Space Packet + PUS-C, APIDs Apogée, encodage bit-à-bit |
| [`docs/COURS_C_FIRMWARE.md`](docs/COURS_C_FIRMWARE.md) | Tour de référence du firmware C (dense — à relire après le parcours) |
| [`docs/COURS_COMMS_PROTOCOLE.md`](docs/COURS_COMMS_PROTOCOLE.md) | Tour de référence du protocole : BE, primary header, PUS, CRC, traces |
| [`docs/cours/INDEX.md`](docs/cours/INDEX.md) | **Parcours d'apprentissage progressif** C → embarqué → CCSDS (en construction) |

## Métriques actuelles

- Bundle frontend : **263 kB JS · gzipped 78 kB** (+ Cesium externe via plugin)
- Worker SGP4 isolé : **22 kB**
- Firmware binaire : **~31 kB** stripped, RAM résidente <1 KB · crypto inclus (SHA-256 + HMAC + auth ~10 kB)
- Build complet (3 packages) : **<2 s**
- Télémétrie firmware : **10 Hz · 40 B (CCSDS PUS 3/25)** · 0 paquet corrompu sur >10⁴ paquets observés
- TC authentifiée : **PING 28 B · SET_MODE 30 B · REBOOT 29 B** (CCSDS PH + PUS + Payload + **MAC 16 B** + CRC)
- Réception WebSocket frontend : **~5 Hz** (throttled depuis le firmware 10 Hz)
- Latency commande aller-retour (sol → signature → UDP → vérif HMAC → ack) : **~5–30 ms** sur loopback
- Red team E2E : **5/5 attaques rejetées** avec les bons codes (REPLAY, BAD_CRC, BAD_HMAC × 3)

## Hors scope (volontaire, V1)

- Authentification multi-utilisateurs · DB persistante · vraie radio · déploiement cloud · i18n.
- **Simulation physique haute-fidélité (J2, traînée, attitude dynamics) → roadmap Phase 4 / Apogée Sim.**

## Limitations connues (V1)

- **Anti-replay en RAM volatile** : un attaquant qui force un reboot peut rejouer une TC pré-reboot. Mitigation V2 : compteur en NVRAM ou nonce/timestamp dans le MAC.
- **PSK fixe** : pas de rotation de clé. V2.
- **MAC sur TC uniquement** : les TM (HK + ACK) ne sont pas signées, spoofing TM possible. V2.
- **Pas de confidentialité** : le payload TC reste lisible (authentification only, pas de chiffrement). Choix pédagogique assumé.

## Licence

MIT.
