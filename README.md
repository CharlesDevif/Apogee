# Apogée

> Mini mission control open-source pour CubeSats simulés. Globe 3D temps réel, firmware C autonome en boucle UDP, et banc de démo sécurité applicative pour les protocoles de télémétrie/commande.

## Pourquoi

Apogée est à la fois :

- Un **outil pédagogique** pour les équipes étudiantes CubeSat (Nanolab Academy, AMSAT-F, CSU) qui n'ont pas de stack segment-sol commun open-source.
- Un **banc de démo sécurité** pour les formations et conférences (DEF CON Aerospace Village, Ctrl+Space, CYSAT) — replay, tampering, HMAC strip, anomaly detection sur télémétrie.
- Une **boucle bout-en-bout** vraie : firmware C en allocation statique → UDP binaire → backend Node → globe Cesium 3D + commanding signé HMAC.

Pas une simulation physique haute-fidélité, pas un produit pour opérateurs réels.

## Architecture

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

## Stack

- **Frontend** : React 18 + TypeScript strict + Vite + Resium (Cesium) + Tailwind + Zustand + satellite.js (SGP4 dans Web Worker)
- **Backend** : Node 20 + TypeScript + Express + ws + zod
- **Firmware** : C11, allocation statique, POSIX sockets uniquement, build Make (à venir Phase 2)
- **Monorepo** : pnpm workspaces

## Lancer en local

Prérequis : Node ≥ 20, pnpm ≥ 9.

```bash
pnpm install
pnpm dev
```

- Frontend : <http://localhost:5173>
- Backend : <http://localhost:3001> (healthcheck : `/api/health`)

Tout passe par le proxy Vite : `/api/*` et `/ws` sont relayés vers le backend.

## Utilisation

- **Globe Terre** centré sur l'Europe au boot, ~35 satellites réels affichés en temps réel (ISS, Hubble, Tiangong, NOAA, Landsat, Starlink, etc.) propagés via SGP4 dans un Web Worker dédié.
- **Click sur un satellite** ou taper `/` puis le nom → la caméra zoom dessus, son orbite complète apparaît en pointillés phosphore, télémétrie live (lat/lon/alt) dans le rail droit.
- **Free-fly camera** : `W/A/S/D` (translation), `Q/E` (roll), `Space/Shift` (haut/bas), `drag` souris (orbit).

## Conventions

Avant de toucher au code, lire :

- [`CLAUDE.md`](CLAUDE.md) — contrat opérationnel du projet (résumé exécutif).
- [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md) — brief technique complet, archi, specs firmware/backend.
- [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — tokens, primitives, anti-patterns « AI slop ».
- [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md) — règles React 19, TypeScript strict.

## Roadmap

- [x] **Phase 0 — Squelette** : monorepo, globe Cesium vide, backend `/api/health`
- [x] **Phase 1 — MVP** : TLE Celestrak, propagation SGP4 dans Web Worker, satellites réels mobiles, tracking + orbites
- [ ] **Phase 2 — V1** : firmware C, télémétrie binaire UDP, commandes basiques, CubeSat sur le globe
- [ ] **Phase 3 — V2** : couche HMAC, détection d'anomalies, mode "attaque" pour démo sécurité
- [ ] **Phase 4 — V3** : SatNOGS, hardware-in-the-loop optionnel

Détails dans [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md).

## Licence

MIT.
