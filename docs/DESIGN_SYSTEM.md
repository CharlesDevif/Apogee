# Apogée — Design System

> **Lis ceci avant d'écrire la moindre ligne d'UI.** Ce document fixe la langue visuelle d'Apogée. Toute déviation doit être justifiée explicitement, pas improvisée.

---

## 1. Intention

Apogée est un **poste d'opération**, pas un dashboard SaaS. L'interface doit donner l'impression d'un instrument réel, hérité des salles de contrôle NASA des années 60-70 et des consoles de mainframe phosphore. **Densité informationnelle élevée**, **typographie qui assume sa nature monospace**, **affordance technique** (brackets, dashes, callsigns, codes hex), **silence visuel** entre les zones critiques.

L'utilisateur doit penser : *"je peux casser quelque chose si je touche au mauvais bouton"*.

### Trois mots qui résument la direction
1. **Phosphore** — couleurs lumineuses sur fond profond, glow contenu, scanlines, grain CRT.
2. **Brutaliste** — pas d'arrondis, pas d'ombres douces, pas de gradients pastels. Bordures nettes, brackets affirmés.
3. **Mono** — toute l'UI en monospace ou display-mono. Aucune *sans-serif générique* (Inter, Roboto, system).

---

## 2. Anti-AI-slop : règles d'exclusion

Ce qu'on **n'utilise jamais** dans Apogée. Si tu vois l'un de ces motifs apparaître, c'est un bug visuel à corriger.

| ❌ À bannir | ✅ À utiliser à la place |
|---|---|
| Inter, Roboto, Arial, system-ui sans-serif | JetBrains Mono, Major Mono Display, Syne Mono |
| Gradients violet/rose/cyan « AI default » | Palette phosphore ambre/jade sur noir profond uniquement |
| `border-radius` sur cartes principales | Coins droits + brackets décoratifs |
| Ombres douces type `shadow-lg` Material | Glow phosphore par `text-shadow` ou `box-shadow` cohérent palette |
| Boutons pilule pleins de couleur primaire | Boutons rectangulaires, fond panel, bordure phosphore, label en uppercase tracking large |
| Émojis dans l'UI | Icônes ASCII / Unicode techniques (▮, ▶, ●, [ ], ·) ou SVG monochromes |
| Animations « bouncy » avec spring | Animations linéaires courtes, blink discret, scan-line continue |
| Toasts / notifications floats colorées | Event log textuel défilant en bas du panneau de droite |
| Skeleton loaders pulsants gris | `awaiting telemetry · ...` en texte mono dim |
| Placeholder « Lorem ipsum » | Placeholders fonctionnels (`—`, `NOT LOADED`, `DISCONNECTED`) |
| Avatars colorés ronds | Pas d'avatars. Callsigns texte (`STA · BSN-01`) |
| Glassmorphism pastel | Backdrop blur subtil sur panneaux foncés uniquement |

---

## 3. Tokens (source de vérité : `apps/web/tailwind.config.js`)

### 3.1 Couleurs

| Token Tailwind | Hex | Usage |
|---|---|---|
| `void` | `#04070a` | Fond global, fond globe Cesium |
| `graphite` | `#0a1014` | Fond panneaux secondaires |
| `panel` | `#0d1419` | Fond panneaux principaux |
| `rail` | `#0f181f` | Fond rails latéraux |
| `border` | `#1c2c38` | Bordures fines de tous les panneaux |
| `seam` | `#274050` | Bordures actives / focus |
| **`phosphor`** | `#ffb700` | Accent primaire (header, highlights, brackets) |
| `phosphorDim` | `#8a6300` | Phosphore atténué (état warning) |
| **`jade`** | `#7dffb1` | Accent secondaire (états OK, états positifs) |
| `jadeDim` | `#3a8859` | Jade atténué |
| **`alert`** | `#ff4d3d` | Erreurs, états down, alarmes |
| `ink` | `#c9d6df` | Texte principal |
| `dim` | `#43576a` | Texte secondaire / labels |
| `deep` | `#283845` | Séparateurs, ponctuations inline (`·`, `|`) |

**Règle de proportions** : `void` + `panel` couvrent ~80 % de l'écran. `phosphor` doit rester rare (~5 %), `jade` aussi rare. Si tu vois plus de 3 zones simultanément ambrées, c'est trop.

### 3.2 Typographie

| Token | Famille | Usage |
|---|---|---|
| `font-display` | **Major Mono Display** | Titres APOGÉE, modes (`IDLE`, `NOMINAL`), gros readouts |
| `font-mono` | **JetBrains Mono** | Body, télémétrie, valeurs chiffrées |
| `font-ghost` | **Syne Mono** | Accents discrets (chemin user, watermark) |

**Tailles** (toutes en `text-[XXpx]`, pas d'échelle Tailwind par défaut sauf pour `text-xs`) :
- Display headers : `28px`, tracking `0.18em`
- Mode readout : `18px`, tracking `0.2em`
- Valeurs télémétrie : `12-13px`, `tabular-nums`
- Labels (uppercase) : `9-10px`, tracking `0.3em`
- Chrome tertiaire (footer counters) : `9px`, tracking `0.3em`

**Letter-spacing** est un caractère de la marque. Tous les labels uppercase tracking `0.25em` minimum. Ne descends jamais en dessous, ça casse le côté instrument.

**Font features** : globalement `tabular-nums` activé via classe utilitaire `.tnum` sur tout chiffre qui change dans le temps (uptime, télémétrie, timecode).

### 3.3 Espacement

- Grille de référence : 4px (Tailwind `gap-1` = 4px)
- Padding panneau standard : `px-3 py-2` (compact) ou `px-4 py-3` (principal)
- Gap entre modules d'un rail : `gap-2`
- Marges latérales viewport : `px-6`
- Header height : zone fluide ~56px depuis le haut, séparateur dashed ensuite

### 3.4 Bordures

- Toujours `1px solid var(--border)` ou `border-border`
- **Pas de border-radius** sur les panneaux. Coins droits.
- Brackets décoratifs via classe `.bracket` (coins phosphore 10×10px en pseudo-éléments)
- Séparateurs horizontaux : `.dashed-h` (ligne dashed 6px, couleur border)

### 3.5 Effets de surface

- `panel` : gradient subtil 180° de `panel/0.92` à `graphite/0.85` + `backdrop-blur-[2px]` + `border-border`
- Glow phosphore : `text-shadow: 0 0 12px rgba(255, 183, 0, 0.35), 0 0 2px rgba(255, 183, 0, 0.7)` via classe `.phosphor`
- Glow jade : équivalent atténué via `.jade`
- Glow alert : équivalent rouge via `.alert-glow`

### 3.6 Effets globaux (toujours actifs sur la viewport)

Trois couches superposées en `position: fixed`, `pointer-events: none` :

1. **Scanlines** (`.scanlines::before`) : `repeating-linear-gradient` horizontal 4px, opacité 0.08, `mix-blend-mode: overlay`.
2. **Sweep bar** (`.scanlines::after`) : barre lumineuse 60px qui descend en 9s linéaires, opacité phosphore 4 %.
3. **Grain** (`.grain::before`) : SVG noise procédural, opacité 5 %, `mix-blend-mode: overlay`.
4. **Vignette** (`.vignette::before`) : radial-gradient assombrissant les bords.

Ces effets ne sont **pas négociables**. Ils définissent le médium visuel d'Apogée. Toute page, modale, écran d'erreur les hérite.

### 3.7 Animation

| Animation | Durée | Easing | Usage |
|---|---|---|---|
| `boot-1` à `boot-6` | 0.5s | ease-out, delays staggered de 130ms | Apparition initiale de chaque zone |
| `blink` | 1.1s | steps(1) | Curseurs, indicateurs critiques |
| `pulseDot` | 1.4s | ease-in-out | Dots d'état warning |
| `scan` | 9s | linear | Sweep bar globale |
| `sweep` | 8-14s | linear | Radar dans le crosshair |
| `flicker` | 4.5s | custom keyframes | Très occasionnel, jamais sur du texte critique |

**Règle** : pas d'animation au hover des panneaux. Pas d'easing « bouncy ». Tout est mécanique, rythmique, prévisible.

---

## 4. Primitives (composants `apps/web/src/components/Hud.tsx`)

### `<Bracket>`
Wrapper qui ajoute des coins phosphore en pseudo-éléments. Usage : pour marquer une zone d'attention principale (panneau Beacon, panneau Event log).

### `<Module>`
Carte de statut d'un sous-système. Props : `label` (uppercase, tracked), `value` (string ou ReactNode), `state` (`ok | warn | down | idle`), `hint` (texte petit dessous), `index` (pour le boot stagger).

Exemple :
```tsx
<Module index={2} label="Backend Link" value="NOMINAL" state="ok" hint="uptime 42s · :3001" />
```

### `<Readout>`
Ligne clé/valeur d'une télémétrie. Props : `k` (label), `v` (valeur), `unit?`, `warn?`. Border-bottom dashed entre chaque ligne, bordure none sur la dernière.

### `<Strip>`
Petit titre de section au-dessus d'un rail, encadré de brackets phosphore `[` `]`.

### `<CornerFrame>`
Quatre angles fixes en haut/bas gauche/droite, bordure phosphore 70 % opacité. Marque la viewport.

### `<Crosshair>`
Réticule centré sur le globe : 2 cercles concentriques, croix, balayage radar tournant.

---

## 5. Patterns d'application

### 5.1 États systèmes

Toujours quatre états, jamais plus :
- `ok` — jade
- `warn` — phosphore (peut pulser via `animate-pulseDot`)
- `down` — alert rouge
- `idle` — dim gris (pas pulsant, pas glowy)

Pas de "loading" séparé. Un système qui charge est `idle` avec hint `…` ou `awaiting <chose>`.

### 5.2 Valeurs absentes

Toujours `—` (em-dash) ou un mot opérationnel en uppercase (`NOT LOADED`, `DISCONNECTED`, `DISARMED`). Jamais `null`, `undefined`, `n/a`, `0` trompeur, ni squelette pulsant.

### 5.3 Logs et événements

Format `[T+0.04] message`. Timestamp relatif au boot du frontend pour l'instant ; deviendra timestamp UTC quand le firmware sera connecté. Mots-clés colorés inline (`<span className="jade">boot complete</span>`). Curseur clignotant `▮` à la fin de la dernière ligne pour signifier que le flux est vivant.

### 5.4 Layout principal

Toujours :
- **Globe Cesium** plein écran en arrière-plan, `z-0`
- **Crosshair** centré, `z-40`
- **Vignette / scanlines / grain** : `z-49 à z-52`
- **Header / rails / footer** : `z-60`
- **Modales et dialogs** (à venir) : `z-70+`

Le globe ne doit jamais être *masqué* par les panneaux : les rails latéraux sont `width: 220-260px`, le centre reste libre.

### 5.5 Texte

- **Tous les labels système** en UPPERCASE, tracking ≥ 0.25em.
- **Valeurs et messages utilisateur** en casse normale.
- **Code, paths, callsigns** dans `font-ghost` ou `font-mono` selon poids.
- Pas d'italiques. Le mono ne s'italise pas bien et casse l'aesthétique.

---

## 6. Accessibilité

Le côté CRT ne dispense pas de l'accessibilité.

- **Contraste** : tester avec [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/). `ink` sur `panel` doit passer AA ≥ 4.5:1. `dim` sur `panel` est seulement décoratif (labels) — accepté à 3:1 minimum.
- **`prefers-reduced-motion`** : à implémenter dès que les animations seront critiques (futur). Désactiver `scan`, `sweep`, `pulseDot`, garder uniquement les boots.
- **Focus visible** : sur tout élément interactif, outline `seam` 2px (à définir quand il y aura des boutons).
- **Sémantique HTML** : header, aside, footer, main. Pas de `div` partout.
- **`aria-live="polite"`** sur l'event log quand il deviendra dynamique.

---

## 7. Évolutions du système (à valider avant ajout)

Quand tu ajoutes un nouveau composant ou pattern, vérifie :

1. Est-ce que ça existe déjà sous une autre forme ? (ne pas dupliquer)
2. Est-ce que ça utilise les tokens déclarés ou ça invente des couleurs/tailles ?
3. Est-ce que ça respecte la règle « 80 % void/panel, ≤ 5 % phosphore » ?
4. Est-ce que ça aurait sa place dans une vraie salle de contrôle ? (test de cohérence narrative)
5. Est-ce que ça active au moins un effet global (scanline, grain) ?

Si la réponse à 1 ou 2 est "non", **revenir au système** plutôt que d'ajouter une exception.

---

## 8. Ressources de référence

Inspirations volontairement assumées :

- **Salles de contrôle réelles** : NASA Apollo MOCR (Houston), ESOC Darmstadt, JPL Mission Control, CNES Toulouse.
- **UI fictionnelles** : *The Expanse* (Roci consoles), *Foundation* (Apple TV+), *Alien* (1979) Mother computer, *Severance* terminal.
- **Jeux** : *Elite Dangerous* HUD orange, *Kerbal Space Program* mission control, *FTL: Faster Than Light*.
- **Outils pro** : Bloomberg Terminal (densité), Splunk SOC dashboards (event log, états), Wireshark (lecture binaire), gnuradio companion (signal flow visuel).
- **Typographie historique** : VT100 phosphore, IBM 3270, Letraset Stencil ITC.

Ne **pas** s'inspirer de : Stripe Dashboard, Vercel UI, Linear, Apple Human Interface, Material Design.

---

## 9. Définition de "fini"

Un écran d'Apogée est fini quand :

- ✅ Il utilise exclusivement les tokens du système.
- ✅ Aucune classe Tailwind couleur arbitraire (`bg-blue-500`, `text-purple-300`, etc.) — uniquement les tokens.
- ✅ Les effets globaux (scanlines, grain, vignette) sont visibles.
- ✅ Au moins un boot stagger est appliqué aux zones principales.
- ✅ Tous les labels uppercase ont tracking ≥ 0.25em.
- ✅ Aucune ombre douce / aucun gradient pastel n'a été ajouté.
- ✅ Le contraste passe AA sur les textes utilisateurs.
- ✅ Le composant est dans `Hud.tsx` ou un fichier dédié, pas inline dans `App.tsx`.
