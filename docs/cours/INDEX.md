# Parcours C → Embarqué → CCSDS

> Apprentissage progressif pour passer de "je code en PHP/JS/TS" à "je comprends le firmware Apogée".
>
> **Format** : 9 chapitres courts (~15-20 min chacun). Chacun a un dossier `cours/NN-titre/` à la racine du repo avec du code à compiler **toi-même**. Tu lis, tu codes, tu observes ce qui sort.
>
> **Règle d'or** : ne passe pas au chapitre suivant si tu n'as pas compilé et lancé l'exo du chapitre courant.

---

## Phase 1 — Le C pur

| # | Titre | État | Sujet |
|---|---|---|---|
| 1 | [Hello, satellite](01-hello.md) | ✅ écrit | Compiler, linker, exécuter ton premier programme |
| 2 | Variables et types | à venir | `int`, `uint8_t`, pourquoi des tailles fixes |
| 3 | Pointeurs et tableaux | à venir | Le concept de mémoire et d'adresse |
| 4 | Structs et `sizeof` | à venir | Grouper des données |
| 5 | Bit manipulation | à venir | Shifts, masks, OR, le bas niveau |

## Phase 2 — Réseau et binaire

| # | Titre | État | Sujet |
|---|---|---|---|
| 6 | Sockets UDP basiques | à venir | Mini client/serveur en 30 lignes |
| 7 | Big-endian | à venir | Pourquoi `htons` existe |
| 8 | Encoder un format binaire | à venir | Inventer ton propre protocole maison |

## Phase 3 — Apogée

| # | Titre | État | Sujet |
|---|---|---|---|
| 9 | Lecture du firmware | à venir | Ouvrir `apps/firmware/src/main.c` et tout comprendre |

---

## Avant de commencer

Vérifie que tu as `gcc` et `make` :

```bash
gcc --version
make --version
```

Sur Ubuntu/Debian si manquant : `sudo apt install build-essential`.

C'est tout. **Ne rajoute pas d'IDE, d'extension, de plugin.** Un éditeur texte + un terminal suffisent. Le but est de voir ce qui se passe sans magie cachée.

---

## Les deux gros docs ne sont **pas** pour maintenant

`docs/COURS_C_FIRMWARE.md` et `docs/COURS_COMMS_PROTOCOLE.md` sont des **références à relire après le parcours**. Ils étaient trop denses pour un démarrage. On y reviendra une fois que tu auras les bases.

---

## C'est parti

→ [Chapitre 1 : Hello, satellite](01-hello.md)
