# Apogée

> Mini centre de contrôle de mission CubeSat — **boucle bout-en-bout** : firmware C en allocation statique → CCSDS Space Packets sur UDP → backend Node → globe 3D Cesium temps réel + console opérateur.

[![Phase](https://img.shields.io/badge/phase-2.6-ffb700?style=flat-square)]() [![C](https://img.shields.io/badge/firmware-C11_static-7dffb1?style=flat-square)]() [![Stack](https://img.shields.io/badge/stack-React_19_·_TS_strict_·_Vite-04070a?style=flat-square)]() [![Protocol](https://img.shields.io/badge/protocol-CCSDS_133.0--B--2_+_PUS--C-7dffb1?style=flat-square)]() [![Licence](https://img.shields.io/badge/licence-MIT-1c2c38?style=flat-square)]()

---

## Ce qui tourne aujourd'hui

- 🌍 **Globe 3D Cesium** centré sur l'Europe, ~35 satellites réels (ISS, Tiangong, Hubble, Crew Dragon, Landsat…) propagés via SGP4 dans un Web Worker dédié à 1 Hz, TLE rafraîchies depuis Celestrak toutes les 6 h.
- 🛰️ **CubeSat simulé `APOGÉE-1`** : firmware C autonome, state machine `BOOT → SAFE → NOMINAL → COMMS → FAULT`, orbite ISO-like (incl. 51.6°, période 92 min), gestion batterie, télémétrie **CCSDS Space Packet · PUS 3/25 housekeeping** à 10 Hz.
- 📡 **Backend Node** : pull TLE Celestrak, dispatch UDP par APID (HK / TC verification), encodage des télécommandes, broadcast WebSocket au frontend, vérification CRC-16-CCITT sur tout paquet.
- 🎯 **Tracking unifié** : `/` ouvre une barre de recherche fuzzy ; click sur un satellite → la caméra y vole, son orbite complète apparaît en pointillés phosphore, sa lat/lon/alt s'affiche en live.
- ⌨️ **Console opérateur** plein-bas : bandeau d'état permanent (mode, batterie, âge dernier TM, link, TC OK/FAIL/PEND), log filtrable avec UTC absolu + latency, REPL avec history (↑↓), tab complete, hotkey `/` global. **Confirmation 2 étapes pour `reboot`** (ARMED → exécution).
- 🔁 **Chaîne de commandes** UI → backend → firmware : `PING` (PUS 17/1), `SET_MODE` et `REBOOT` (PUS 8/1). Chaque TC reçoit un ack `PUS 1/1` (success) ou `1/2` (failure avec code mappé sur l'enum `CommandOutcome` du firmware).
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
4. Le bandeau console en bas affiche : `MODE: SAFE`, `BATTERY: 7.40 V`, `LAST TM: 0.2s`, `LINK: OPEN`.
5. Tape <kbd>/</kbd>, puis `nominal` <kbd>⏎</kbd> — TC#001 part, ACK OK ~10 ms après, le mode passe à `NOMINAL`.
6. Tape `reboot` <kbd>⏎</kbd> — ARMED 2 s, <kbd>⏎</kbd> à nouveau pour confirmer. Le firmware fait un fresh BOOT.
7. Coupe le firmware (<kbd>Ctrl+C</kbd>) — le link passe `disconnected`, le point disparaît, `LAST TM` passe en `STALE`.

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
- [x] **Phase 2.6** — migration CCSDS + PUS-C, chaîne de commandes UI → backend → firmware (PING, SET_MODE, REBOOT), TC verification (acks), console opérateur
- [ ] **Phase 3 — Sécurité** — couche HMAC sur les commandes, détection d'anomalies, **mode "attaque" pour démo CYSAT/DEF CON** (replay, tampering, HMAC strip)
- [ ] **Phase 4** — intégration SatNOGS, hardware-in-the-loop optionnel (cross-compile Raspberry Pi / STM32)

## Conventions et docs

Avant de toucher au code, lire :

| Doc | Sujet |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Contrat opérationnel, stack figée, posture de collaboration |
| [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md) | Brief technique complet, archi, specs firmware/backend |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Tokens, primitives, anti-AI-slop, règles d'évolution |
| [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md) | React 19 moderne, TypeScript strict, anti-patterns |
| [`docs/PROTOCOL.md`](docs/PROTOCOL.md) | CCSDS Space Packet + PUS-C, APIDs Apogée, encodage bit-à-bit |
| [`docs/COURS_C_FIRMWARE.md`](docs/COURS_C_FIRMWARE.md) | Tour pédagogique du firmware C (modules, choix, pièges) |
| [`docs/COURS_COMMS_PROTOCOLE.md`](docs/COURS_COMMS_PROTOCOLE.md) | Tour pédagogique du protocole : BE, primary header, PUS, CRC, traces |

## Métriques actuelles

- Bundle frontend : **237 kB JS · gzipped 70 kB**
- Worker SGP4 isolé : **22 kB**
- Firmware binaire : **~30 kB** stripped, RAM résidente <1 KB
- Build complet (3 packages) : **<2 s**
- Télémétrie firmware : **10 Hz · 40 B (CCSDS PUS 3/25)** · 0 paquet corrompu sur >10⁴ paquets observés
- Réception WebSocket frontend : **~5 Hz** (throttled depuis le firmware 10 Hz)
- Latency commande aller-retour (sol → firmware → ack sol) : **~5–30 ms** sur loopback

## Hors scope (volontaire)

- Authentification multi-utilisateurs · DB persistante · vraie radio · simulation physique haute-fidélité (J2, traînée) · déploiement cloud · i18n.

## Licence

MIT.

---

*Apogée est un projet personnel de Charles, basé à Bessan (Hérault). Cible : équipes spatiales françaises (Look Up Space, CS Group, Thales Alenia Space, Airbus DS, CLS) et communauté sécu spatiale.*
