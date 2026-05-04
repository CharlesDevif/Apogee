# CLAUDE.md — Apogée

> Tu lis ce fichier au début de chaque session. **Ne le saute pas.** Il contient le contrat opérationnel du projet.

## 1. Identité du projet

**Apogée** — mini mission control open-source pour CubeSats simulés. Stack React + Cesium 3D + Node + firmware C avec couche sécu HMAC. Boucle bout-en-bout : firmware → UDP binaire → backend → globe + commanding signé.

**Positionnement** (issu de la session brainstorming 2026-05-03, à valider) :
- Cible **B** : étudiants / makers / équipes universitaires CubeSat (Nanolab Academy, AMSAT-F, CSU)
- Cible **D** : communauté sécu spatiale (formations, démos d'attaques, conférences DEF CON Aerospace Village / Ctrl+Space)
- **Pas** un produit pour opérateurs réels. **Pas** une simulation physique haute-fidélité.

Brief complet : [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md).

## 2. Charles (l'utilisateur)

- Dev full-stack senior : React, TypeScript, Node, PHP. À l'aise.
- En apprentissage : C embarqué, flight software, protocoles binaires.
- Master en sécurité applicative — c'est un axe d'expertise réel, à valoriser.
- **Communique en français**, code en anglais (commentaires anglais OK, READMEs FR OK).
- Basé à Bessan (Hérault). Cible recruteurs : Look Up Space, CS Group, Thales Alenia, Airbus DS, CLS.
- **Préfère les choix concrets utiles** plutôt que les concepts portfolio décoratifs.
- Quand il dit "je sais pas quoi dire" sur un exercice, c'est souvent qu'il n'adhère pas au cadrage. Re-cadrer plutôt que pousser.

## 3. Documents à respecter (lire à la demande)

| Doc | Quand le consulter |
|---|---|
| [`docs/APOGEE_BRIEF.md`](docs/APOGEE_BRIEF.md) | Pour l'archi globale, les specs firmware/backend, la roadmap, les contraintes non-scope. |
| [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) | **Avant toute UI.** Tokens, primitives, anti-AI-slop, règles d'évolution. Non-négociable. |
| [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md) | **Avant tout code React.** Règles d'or, patterns React 19, anti-patterns, perf, structure. |
| `_bmad-output/brainstorming/brainstorming-session-2026-05-03-1955.md` | Pour le contexte stratégique : recherches web, paysage concurrentiel, repositionnement. |

## 4. Stack figée (ne pas dévier sans accord explicite)

- **Frontend** : React 19, TypeScript strict, Vite 5, Resium (Cesium), Tailwind, Zustand. Pas de Redux, pas de Next.
- **Backend** : Node 20+, TypeScript, Express, ws, zod. Pas de DB en MVP/V1.
- **Firmware** : C11, allocation statique uniquement, POSIX sockets, Make. Pas de malloc, pas de récursion, pas de dépendances externes.
- **Monorepo** : pnpm workspaces. Apps dans `apps/*`, packages partagés dans `packages/*`.

## 5. Esthétique du frontend (résumé exécutif)

Voir [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) pour le détail. En 3 lignes :

- **Mission control brutaliste, phosphore CRT.** Pas un dashboard SaaS.
- **Typographie** : Major Mono Display (display) + JetBrains Mono (body) + Syne Mono (accents). **Aucune sans-serif** (pas d'Inter, Roboto, system).
- **Couleurs** : void noir + panel graphite + accent ambre `#ffb700` + jade `#7dffb1` + alert `#ff4d3d`. **Pas de gradients pastels, pas de border-radius, pas de shadow douce.**

Effets globaux **non-négociables** : scanlines + sweep bar + grain SVG + vignette + corner brackets phosphore.

## 6. Code React — règles d'or résumées

Détail dans [`docs/REACT_CONVENTIONS.md`](docs/REACT_CONVENTIONS.md). À retenir :

1. **Pas de `forwardRef`** dans le nouveau code (React 19 : `ref` est une prop).
2. **Pas de `useEffect` pour dériver de l'état** — calculer en render.
3. **TanStack Query** pour le server state. **Zustand** pour le client UI uniquement.
4. **Discriminated unions** pour tout state machine (link state, mission mode, fetch state).
5. **Sélecteurs Zustand fins** : `useStore(s => s.x)`.
6. **Pas de mutation directe.** Tout immutable.
7. **Suspense + ErrorBoundary par panel**, pas un seul global.
8. **SGP4 dans un Web Worker dédié.** Pas de calcul orbital sur main thread.
9. **Pas de RSC / `"use server"`.** SPA Vite, point.
10. **Cesium** : un seul `<Viewer>` monté à la fois, mutations `viewer.scene.*` dans `useEffect` uniquement.

## 7. Conventions transverses

- **Commits** : Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`).
- **Branches** : `main` stable, features sur `feat/<nom>`.
- **Code en anglais** (identifiants, commentaires). **Documentation en français** OK.
- **Pas de `console.log` en production.** Logger structuré côté Node, custom léger côté C.
- **TypeScript strict.** Pas de `any` sans commentaire justifiant. `noUncheckedIndexedAccess` à activer.
- **C** : `gcc -Wall -Wextra -Werror -Wpedantic`, build sans warning.

## 8. Hors scope (à NE PAS implémenter sauf demande explicite)

- Authentification utilisateur (mono-utilisateur local).
- Multi-utilisateurs / collaboration.
- Persistance long-terme / DB.
- Vraie radio / réception de signaux.
- Modèles physiques rigoureux (J2, traînée précise).
- Déploiement cloud.
- i18n.
- Server-Side Rendering / RSC / Next.

## 9. Posture de collaboration attendue

- **Réponses courtes.** Pas de résumés en fin de message si le diff est lisible.
- **Texte avant tool calls** : une phrase pour annoncer l'intention.
- **Pas d'émojis dans le code ni les commits.** Émojis OK dans les messages de chat.
- **Pas de comments verbeux dans le code.** Si le pourquoi n'est pas évident, une ligne max.
- **Avant d'ajouter une dépendance** : vérifier qu'elle n'existe pas déjà, justifier.
- **Avant d'inventer un nouveau token couleur ou pattern UI** : relire `DESIGN_SYSTEM.md` et utiliser ce qui existe.
- **Tester avant de dire "fini"** : `pnpm typecheck` + `pnpm build` au minimum.

## 10. État courant du projet

Phase 0 (squelette) **terminée** :
- Monorepo pnpm avec `apps/web`, `apps/server`, `apps/firmware` (placeholder).
- Frontend : globe Cesium centré sur la Terre + HUD mission control complet (header, rails, footer, crosshair, effets CRT).
- Backend : `/api/health` opérationnel.
- Build clean, typecheck OK.

**Prochaine étape** : Phase 1 — fetch Celestrak côté backend, push TLE par WebSocket, propagation SGP4 dans un Web Worker côté frontend, affichage de 10-20 satellites réels mobiles sur le globe.

À chaque session, vérifier le statut réel via `git log`, le contenu d'`apps/`, et l'état des roadmaps dans `README.md` + `docs/APOGEE_BRIEF.md`.
