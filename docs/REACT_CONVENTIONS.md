# Apogée — Conventions React 19 / TypeScript

> Règles opérationnelles pour le frontend `apps/web`. Toute déviation doit être justifiée.

Stack figée :
- **React 19.x** + ref-as-prop, plus de `forwardRef` dans le nouveau code
- **TypeScript strict** (`strict: true`, `noUncheckedIndexedAccess: true` à activer)
- **Vite 5** (montera vers 8 + React Compiler quand l'écosystème stabilise)
- **Zustand** pour le state UI client
- **TanStack Query** dès qu'on touche au backend (à ajouter en Phase 1)
- **Resium** wrapper Cesium

---

## 1. Règles d'or (relire avant chaque feature)

1. **TanStack Query** pour tout server state (API, WS subscribe). **Zustand** uniquement pour l'état UI client (sélection sat active, panneau ouvert, filtres).
2. **Jamais `useEffect` pour dériver de l'état** — calculer en render. Voir [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect).
3. **Pas de `useMemo` / `useCallback` / `memo` préventifs.** Soit on active React Compiler, soit on mesure d'abord. Pas de bruit cognitif gratuit.
4. **Pas de `forwardRef`** dans du nouveau code. `ref` est une prop ordinaire en React 19.
5. **Pas de mutation directe** (`obj.foo = ...`, `arr.push`). Tout immutable, tout via setter / `set` Zustand / spread.
6. **Suspense + ErrorBoundary par panel**, pas un seul global.
7. **Code-splitter le `<Viewer>` Cesium** (`React.lazy`) — ne doit pas être dans le bundle initial quand on aura des routes.
8. **SGP4 dans un Web Worker dédié.** Aucun calcul orbital dans le main thread.
9. **Discriminated unions** pour tout state machine (link state, mission mode, fetch state).
10. **Sélecteurs Zustand fins** : `useStore(s => s.x)`, jamais le store entier.
11. **Pas de `key={index}`** sur listes mutables (satellites, events, alerts).
12. **`startTransition` / `useDeferredValue`** pour tout filtre/recherche sur > 1k items.
13. **Pas de RSC / `"use server"`.** C'est une SPA Vite, point.
14. **Tout nouveau hook custom** : préfixe `use`, pas de side-effect à l'import, signature stable, un test Vitest.
15. **ESLint `react-hooks` recommended-latest doit passer.** Zéro warning toléré en CI.

---

## 2. React 19.x — primitives à utiliser

### `ref` comme prop
```tsx
type FieldProps = {
  label: string;
  ref?: React.Ref<HTMLInputElement>;
} & React.InputHTMLAttributes<HTMLInputElement>;

export function Field({ label, ref, ...rest }: FieldProps) {
  return (
    <label>
      {label}
      <input ref={ref} {...rest} />
    </label>
  );
}
```

### `<Context>` directement
```tsx
const ThemeCtx = createContext<"dark" | "light">("dark");
<ThemeCtx value="dark">{children}</ThemeCtx>; // pas .Provider
```

### `use(promise)` + Suspense
La promesse **doit** être créée hors du composant (cache, store, route loader) — sinon boucle infinie.
```ts
// data/handshake.ts
export const handshakePromise = fetch("/api/health").then(r => r.json());

// Header.tsx
import { use } from "react";
export function HeaderHealth() {
  const h = use(handshakePromise);
  return <span>{h.status}</span>;
}
```
Sur Apogée : `use()` reste niche. On utilise TanStack Query pour le data backend ; `use()` sert pour résoudre une promesse cache (handshake WS, asset Cesium).

### Document metadata in-place
```tsx
function MissionPage() {
  return (
    <>
      <title>Apogée · TRACKING ISS</title>
      {/* ... */}
    </>
  );
}
```
React 19 hoiste et déduplique `<title>`, `<meta>`, `<link>`, `<script async>` automatiquement.

### `<Activity>` (React 19.2)
Pour préserver l'état + le DOM d'un panel quand on le cache :
```tsx
<Activity mode={isVisible ? "visible" : "hidden"}>
  <TelemetryPanel />
</Activity>
```
Évite de re-monter (et réinitialiser) un panneau lourd entre tabs.

### `useEffectEvent` (React 19.2)
Pour extraire du code non-réactif d'un effet :
```tsx
const onMessage = useEffectEvent((msg: Telemetry) => {
  emitToLog(currentChannel, msg); // currentChannel pas dans les deps
});
useEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  return () => ws.close();
}, [url]); // currentChannel exclu légitimement
```

---

## 3. TypeScript strict — règles précises

### Props
- **`type` plutôt que `interface`** (intersections plus simples).
- **Children = `React.ReactNode`**, jamais `JSX.Element` (trop restrictif).
- **`ReactElement`** = ce que retourne `createElement`, à utiliser quand on type un seul élément précis.

### Discriminated unions partout où c'est pertinent
```ts
type LinkState =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "locked"; rssi_dbm: number }
  | { kind: "tracking"; rssi_dbm: number; mode: SatMode }
  | { kind: "lost"; lastSeen: number };

function renderLink(s: LinkState) {
  switch (s.kind) {
    case "tracking":
      return <span>{s.rssi_dbm} dBm · {s.mode}</span>;
    // exhaustivité vérifiée par TS
  }
}
```
Élimine les `data?` et les booléens combinatoires. Idéal pour : link state, fetch state, mission mode firmware.

### Generic components
```tsx
function List<T>({ items, render }: { items: T[]; render: (i: T) => React.ReactNode }) {
  return <ul>{items.map((it, i) => <li key={i}>{render(it)}</li>)}</ul>;
}
```

### Conventions nommage
- Composants : `PascalCase`, **un fichier = un composant principal exporté par défaut**, exports nommés pour les sous-composants.
- Hooks : `useCamelCase`, fichier `useChose.ts`.
- Types globaux dans `src/types.ts` ou `packages/shared-types`.
- Pas de namespace TypeScript.

---

## 4. State management — partition

| Type | Outil | Quand sur Apogée |
|---|---|---|
| **Server state** (API, WS, retry, cache) | TanStack Query | TLE Celestrak, /api/health, futur /api/command |
| **Client UI global** | Zustand | Sat sélectionné, panneau ouvert, filtres, prefs UI |
| **Local atomique** | `useState` / `useReducer` | Default pour composants isolés |
| **Context React** | DI uniquement (theme, services) | Pas pour data qui change souvent |
| **Web Worker → React** | Comlink ou `postMessage` + custom hook | SGP4, futur décodeur télémétrie |

### Zustand — règles d'utilisation
```ts
// store/mission.ts
import { create } from "zustand";

type MissionState = {
  selectedSat: string | null;
  panelsOpen: { left: boolean; right: boolean };
  selectSat: (id: string | null) => void;
  togglePanel: (side: "left" | "right") => void;
};

export const useMissionStore = create<MissionState>((set) => ({
  selectedSat: null,
  panelsOpen: { left: true, right: true },
  selectSat: (id) => set({ selectedSat: id }),
  togglePanel: (side) =>
    set((s) => ({
      panelsOpen: { ...s.panelsOpen, [side]: !s.panelsOpen[side] },
    })),
}));
```

Usage :
```tsx
// ✅ Sélecteur fin
const sel = useMissionStore((s) => s.selectedSat);

// ❌ Le store entier (re-render à chaque change)
const store = useMissionStore();
```

### TanStack Query — quand on l'ajoutera
- `staleTime` explicite par query (TLE = 6h, health = 5s).
- Devtools en dev only (`import.meta.env.DEV`).
- Pas de fetch dans `useEffect` une fois TanStack Query installé.

---

## 5. Performance

### Avec / sans React Compiler
**Sans Compiler (état actuel)** : `useMemo` / `useCallback` quand on a vraiment un calcul lourd ou un callback passé à un composant memoizé.

**Avec Compiler (Phase 2 ou 3 quand Vite 8 + plugin sont solides)** : virer toutes les memo manuelles, laisser le compiler bosser.

Activation Vite 8 (à faire plus tard) :
```ts
// vite.config.ts
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

export default defineConfig({
  plugins: [
    react(),
    babel({ babelConfig: { presets: [reactCompilerPreset({ target: "19" })] } }),
  ],
});
```

### Toujours pertinent (avec ou sans Compiler)
- **`startTransition`** pour update non-urgent (filtre 10k sats).
- **`useDeferredValue`** pour input lourd (recherche).
- **`React.lazy` + `Suspense`** par panel lourd.
- **Web Workers** pour CPU-bound. Le worker n'a rien à voir avec React — on l'expose via un hook custom.

### Cesium / Resium — points cruciaux
- **Un seul `<Viewer>`** monté à la fois. Le démonter = perdre le contexte WebGL (coûteux).
- **Mutations impératives** sur `viewer.scene.*` uniquement dans `useEffect`. Jamais en render.
- **Refs Cesium** : `useRef<CesiumComponentRef<CesiumViewer>>(null)`, accès via `.current?.cesiumElement`.
- **Lazy-loader le Viewer** dès qu'il y aura des routes (Phase 2+).
- **Web Worker SGP4** : alimenter un `CallbackProperty` Cesium qui interroge le worker à chaque frame — évite tout re-render React.
- **HMR** : éviter de muter `viewer.scene.*` ailleurs que dans des effets.

---

## 6. Anti-patterns à bannir

| ❌ | ✅ |
|---|---|
| `useEffect` pour calculer un dérivé | Calculer en render |
| `useEffect` pour synchroniser deux states | Un seul state source, autre dérivé |
| `useState` pour une valeur qui ne re-render pas | `useRef` |
| Fetch dans `useEffect` quand TanStack Query existe | TanStack Query |
| Mutation `obj.foo = ...` ou `arr.push(...)` | Spread, immutabilité |
| Context monolithique qui contient tout | Splitter par domaine ou Zustand |
| Prop drilling > 3 niveaux | Context (DI) ou Zustand |
| `key={index}` sur liste mutable | `key={item.id}` stable |
| `forwardRef` dans nouveau code | `ref` comme prop |
| `useMemo` / `useCallback` partout | Mesurer, ou compiler |
| Lecture ref pendant le render | Effets/handlers uniquement |
| `Date.now()` / `Math.random()` en render | useRef initialisé ou effet |

---

## 7. Outillage cible

### ESLint 9 flat config (à ajouter dès Phase 1)
```js
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default [
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat["recommended-latest"],
  reactX.configs["recommended-typescript"],
  reactDom.configs.recommended,
  { languageOptions: { parserOptions: { project: "./tsconfig.json" } } },
];
```

- `eslint-plugin-react-hooks` ≥ 5.2 (inclut règles React Compiler).
- `eslint-plugin-react-x` (TypeScript-aware) > legacy `eslint-plugin-react`.

### Tests
- **Vitest** (Vite-native, API Jest-compatible).
- **React Testing Library** + `@testing-library/user-event` v14.
- **Playwright** pour e2e + tests visuels du Viewer (RTL ne sait pas tester WebGL).
- Mocker `IntersectionObserver`, `ResizeObserver` au niveau setup global.

---

## 8. Structure de fichiers (à respecter)

```
apps/web/src/
├── App.tsx              # Layout racine + composition
├── main.tsx             # Bootstrap React + StrictMode
├── index.css            # Tailwind + tokens globaux (design system)
├── vite-env.d.ts        # Types Vite env
├── components/          # Primitives partagées (Hud.tsx, etc.)
├── features/            # Modules par domaine (satellites/, telemetry/, security/)
│   └── satellites/
│       ├── SatList.tsx
│       ├── useSatellite.ts
│       └── store.ts
├── hooks/               # Hooks transverses (useUtcClock, useBackendHealth)
├── store/               # Stores Zustand globaux
├── workers/             # Web Workers (sgp4.worker.ts)
├── types.ts             # Types globaux du frontend
└── lib/                 # Utils purs (fmt, math, etc.)
```

Règle : **un domaine = un dossier `features/<nom>`**. Pas de `containers/`, pas de `pages/` (on n'a pas de routing complexe pour l'instant). Pas de `utils/` fourre-tout — soit `lib/<sujet>.ts`, soit dans le domaine.

---

## 9. Définition de "fini" pour un composant React

- ✅ TypeScript strict passe (`pnpm typecheck`).
- ✅ Pas de `any`, pas de `as` non justifié.
- ✅ Props typées avec `type` (pas `interface` sauf si extension).
- ✅ Pas de `useEffect` qui pourrait être un calcul render.
- ✅ Pas de `forwardRef` dans le nouveau code.
- ✅ Pas de mutation directe.
- ✅ Sélecteurs Zustand fins.
- ✅ Si > 50 lignes : extraire en sous-composants.
- ✅ Si fait des calculs > 5ms : `useMemo` ou Worker.
- ✅ Si listes : `key` stable, jamais `index`.
- ✅ Respecte le design system (`docs/DESIGN_SYSTEM.md`).
- ✅ Test Vitest si la logique est non-triviale.

---

## 10. Sources de référence

- [React v19 — react.dev](https://react.dev/blog/2024/12/05/react-19)
- [React 19.2 — react.dev](https://react.dev/blog/2025/10/01/react-19-2)
- [React Compiler v1.0 — react.dev](https://react.dev/blog/2025/10/07/react-compiler-1)
- [Rules of React](https://react.dev/reference/rules)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- [React State Management 2025 — Developer Way](https://www.developerway.com/posts/react-state-management-2025)
- [Resium guide](https://resium.reearth.io/guide)
