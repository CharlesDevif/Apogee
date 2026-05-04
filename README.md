# Apogée

> Mini centre de contrôle de mission CubeSat — **boucle bout-en-bout** : firmware C en allocation statique → UDP binaire → backend Node → globe 3D Cesium temps réel + commanding signé HMAC.

[![Phase](https://img.shields.io/badge/phase-2.5-ffb700?style=flat-square)]() [![C](https://img.shields.io/badge/firmware-C11_static-7dffb1?style=flat-square)]() [![Stack](https://img.shields.io/badge/stack-React_19_·_TS_strict_·_Vite-04070a?style=flat-square)]() [![Licence](https://img.shields.io/badge/licence-MIT-1c2c38?style=flat-square)]()

---

## Ce qui tourne aujourd'hui

- 🌍 **Globe 3D Cesium** centré sur l'Europe, ~35 satellites réels (ISS, Tiangong, Hubble, Crew Dragon, Landsat…) propagés via SGP4 dans un Web Worker dédié à 1 Hz, TLE rafraîchies depuis Celestrak toutes les 6 h.
- 🛰️ **CubeSat simulé `APOGÉE-1`** : un firmware C autonome qui boot, fait sa state machine `BOOT → SAFE → NOMINAL`, calcule sa position en orbite ISO-like (incl. 51.6°, période 92 min), gère sa batterie, et émet une télémétrie binaire 40 octets à 10 Hz vers le backend.
- 📡 **Backend Node** qui dispatch : pull TLE, listen UDP firmware, décode + valide CRC-16-CCITT, broadcast WebSocket au frontend.
- 🎯 **Tracking unifié** : `/` ouvre une barre de recherche fuzzy ; click sur un satellite → la caméra y vole, son orbite complète apparaît en pointillés phosphore, sa lat/lon/alt s'affiche en live.
- 🎨 **HUD mission control brutaliste** : phosphore CRT, scanlines, grain, brackets, typo *Major Mono Display* + *JetBrains Mono* — design system documenté, anti-AI-slop assumé.

## Démo en 30 secondes

```bash
git clone <repo> apogee && cd apogee
pnpm install
pnpm dev:all          # web :5173 + backend :3001 + firmware C
```

Ouvre <http://localhost:5173>.

1. Le globe se centre sur l'Europe, 35 satellites apparaissent et bougent.
2. Tape <kbd>/</kbd>, écris `iss`, ⏎ — la caméra zoom sur l'ISS, son orbite se trace.
3. Le point ambre `APOGÉE-1` apparaît, traverse l'Atlantique, l'Europe, l'Asie en quelques minutes.
4. Le rail droit affiche en live : `Mode: NOMINAL`, `Battery: 7.40 V`, `Attitude: roll/pitch/yaw`, `Alt: 400 km`.
5. Coupe le firmware (<kbd>Ctrl+C</kbd>) — le link passe `disconnected`, le point disparaît.

## Architecture

```
┌────────────────────────────────────────────┐
│   Frontend — Mission Control Dashboard     │
│   React 19 + TS strict + Vite + Cesium 3D  │
│   SGP4 dans Web Worker · Zustand state     │
└────────────────────┬───────────────────────┘
                     │ WebSocket JSON (tle, telemetry, alerts)
┌────────────────────┴───────────────────────┐
│   Backend — Node.js Bridge                 │
│   Express + ws + zod · décodeur CRC-16     │
│   Celestrak cache 6h · Auth HMAC (V2)      │
└──────────┬───────────────────────┬─────────┘
           │ HTTPS (TLE refresh)    │ UDP localhost (binaire 40 o)
           │                        │
┌──────────┴──────────┐  ┌──────────┴──────────┐
│  Satellites réels   │  │  CubeSat simulé     │
│  Celestrak · ISS    │  │  Firmware C11       │
│  Hubble · Starlink  │  │  Static alloc only  │
└─────────────────────┘  └─────────────────────┘
```

### Format de télémétrie firmware (40 octets, little-endian, magic 0xAB1E)

| offset | size | type | champ | exemple |
|---|---|---|---|---|
| 0 | 2 | u16 | magic | `0xAB1E` |
| 2 | 1 | u8 | version | `0x01` |
| 3 | 1 | u8 | mode | `1` (NOMINAL) |
| 4 | 4 | u32 | tick_count | `5240` |
| 8 | 8 | u64 | timestamp_us | unix µs |
| 16 | 4 | i32 | lat × 10⁷ | `433_430_000` |
| 20 | 4 | i32 | lon × 10⁷ | `34_200_000` |
| 24 | 4 | u32 | alt_m | `400_000` |
| 28 | 2 | u16 | battery_mv | `7400` |
| 30 | 6 | i16×3 | roll/pitch/yaw × 10° | `0,0,0` |
| 36 | 2 | u8×2 | reserved | `0` |
| 38 | 2 | u16 | crc16 | CRC-16-CCITT |

Validé à la compilation par `_Static_assert(sizeof(TelemetryPacket) == 40)`.

## Pourquoi ce projet ?

Apogée est à la fois :

- **Un outil pédagogique** pour les équipes étudiantes CubeSat (Nanolab Academy, AMSAT-F, CSU) qui n'ont pas de stack segment-sol commun open-source.
- **Un banc de démo sécurité applicative** pour formations et conférences (DEF CON Aerospace Village, Ctrl+Space, CYSAT) : replay, tampering, HMAC strip, anomaly detection sur télémétrie réelle (Phase 3).
- **Un terrain d'apprentissage flight software** : firmware C strict (`-Wall -Wextra -Werror -Wpedantic`), zéro `malloc`, zéro récursion, allocation statique uniquement, comme un vrai bus CubeSat.

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

## Roadmap

- [x] **Phase 0** — squelette monorepo, globe Cesium vide, `/api/health`
- [x] **Phase 1** — TLE Celestrak, propagation SGP4, satellites Terre temps réel, tracking + orbites
- [x] **Phase 2.1-2.5** — firmware C autonome, télémétrie binaire UDP, state machine, physics, CubeSat live sur le globe
- [ ] **Phase 2.6** — chaîne de commandes UI → backend → firmware (PING, SET_MODE, REBOOT)
- [ ] **Phase 3 — Sécurité** — couche HMAC sur les commandes, détection d'anomalies, **mode "attaque" pour démo CYSAT/DEF CON**
- [ ] **Phase 4** — intégration SatNOGS, hardware-in-the-loop optionnel (cross-compile Raspberry Pi)

## Conventions du projet

Avant de toucher au code, lire :

| Doc | Sujet |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Contrat opérationnel, stack figée, posture de collaboration |
| [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md) | Brief technique complet, archi, specs firmware/backend |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | Tokens, primitives, anti-AI-slop, règles d'évolution |
| [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md) | React 19 moderne, TypeScript strict, anti-patterns |

## Métriques actuelles

- Bundle frontend : **224 kB JS · gzipped 66 kB**
- Worker SGP4 isolé : **22 kB**
- Firmware binaire : **~30 kB** stripped, RAM résidente <1 KB
- Build complet (3 packages) : **<5 s**
- Télémétrie firmware : **10 Hz · 40 o · 0 paquets corrompus** observés sur >10⁴ paquets
- Réception WebSocket frontend : **~5 Hz** (throttled depuis le firmware 10 Hz)

## Hors scope (volontaire)

- Authentification multi-utilisateurs · DB persistante · vraie radio · simulation physique haute-fidélité (J2, traînée) · déploiement cloud · i18n.

## Licence

MIT.

---

*Apogée est un projet personnel de Charles, basé à Bessan (Hérault). Cible : équipes spatiales françaises (Look Up Space, CS Group, Thales Alenia Space, Airbus DS, CLS) et communauté sécu spatiale.*
