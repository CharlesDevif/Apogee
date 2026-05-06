# Chapitre 1 — Hello, satellite

> Durée : 15 min. À la fin tu auras compilé et exécuté ton premier programme C, et tu sauras ce que ça veut dire "compiler".

---

## Ce que tu vas faire

1. Lancer un programme C qui imprime "Hello, satellite" à l'écran.
2. Le modifier pour imprimer autre chose.
3. Comprendre la différence avec PHP/JS.

C'est tout. Pas de pointeurs, pas de structs, pas de jargon. On rentre par la porte.

---

## 1. Le code de départ

Le code est déjà prêt dans `cours/01-hello/`. Va voir :

```bash
cd cours/01-hello
ls
```

Tu devrais voir deux fichiers :

- `hello.c` — le code source en C
- `Makefile` — les instructions pour le compiler

Ouvre `hello.c` dans ton éditeur :

```c
#include <stdio.h>

int main(void) {
    printf("Hello, satellite\n");
    return 0;
}
```

5 lignes. C'est tout un programme C valide.

---

## 2. Compiler et exécuter

Dans le terminal, depuis `cours/01-hello/` :

```bash
make
```

Tu devrais voir une ligne du genre :

```
gcc -Wall -Wextra hello.c -o hello
```

C'est le **compilateur** (`gcc`) qui transforme ton fichier `.c` (du texte) en un fichier exécutable nommé `hello` (du binaire).

Maintenant lance-le :

```bash
./hello
```

→ Sortie attendue :

```
Hello, satellite
```

**Bravo.** Tu viens de compiler et d'exécuter du C. C'est le seuil le plus important du parcours.

---

## 3. Le déclic mental — différence avec PHP/JS

Voilà ce qui change par rapport à ce que tu connais :

### En PHP

```bash
php hello.php
```

L'interpréteur PHP **lit** le fichier ligne par ligne et l'exécute. À chaque exécution, PHP redécouvre ton code.

### En JS (Node)

```bash
node hello.js
```

Pareil — Node lit, parse, et exécute. Plus rapide grâce au JIT, mais l'idée reste la même : **le code reste du texte, tu as besoin d'un programme tiers (PHP, Node) installé pour le lire**.

### En C

```bash
gcc hello.c -o hello   # une fois — produit le fichier 'hello'
./hello                # à chaque exécution — pas de gcc nécessaire
```

`gcc` te produit un fichier binaire qui parle directement au système d'exploitation. Une fois compilé, tu peux **balancer le binaire sur n'importe quelle machine Linux x86_64 compatible et il tournera sans rien d'installé**. Pas besoin de gcc côté production.

### Ce que ça implique

- **Distribution** : tu envoies un binaire, pas du code.
- **Pas de dépendance runtime** : ni interpréteur, ni VM. Le binaire se suffit à lui-même (ou presque — il dépend de la libc, mais c'est sur tous les Linux).
- **Vitesse** : il n'y a pas d'analyse à l'exécution. Le code est déjà prêt à tourner.
- **Plateforme-spécifique** : un binaire compilé sur ton Linux x86 ne tournera pas sur un Mac M1 ou un STM32. Il faut le re-compiler. C'est pour ça qu'on parle de "cross-compilation" pour cibler un microcontrôleur.

C'est exactement pour cette raison que le firmware Apogée est en C : on veut un binaire qui peut **tourner sur un microcontrôleur** sans Python ni Node ni rien.

---

## 4. Décortiquer les 5 lignes

```c
#include <stdio.h>
```

`#include` est une directive **pré-processeur** : avant la compilation, le contenu du fichier `stdio.h` est **collé** ici. `stdio.h` contient les déclarations des fonctions standard d'I/O (input/output). C'est ce qui te donne accès à `printf`.

> **Analogie JS** : ressemble vaguement à `import { printf } from "stdio"`. Sauf qu'en C, c'est du copier-coller textuel à la compilation, pas un système de modules.

```c
int main(void) {
```

`main` est **la** fonction qu'un programme C doit avoir. C'est le point d'entrée — quand tu lances `./hello`, le système commence à exécuter à partir de `main`. Le `int` veut dire "cette fonction retourne un entier" et le `void` "elle ne prend pas d'argument".

```c
    printf("Hello, satellite\n");
```

`printf` imprime sur la sortie standard. Le `\n` est un saut de ligne. Comme `console.log` sauf que tu dois mettre le `\n` toi-même (sinon le prompt revient au milieu de la ligne).

```c
    return 0;
```

Retourner `0` signifie "tout s'est bien passé". Un autre nombre veut dire "il y a eu un problème". C'est ce que tu peux récupérer dans le shell :

```bash
./hello
echo $?       # affiche 0
```

Si ton programme retournait `1`, `echo $?` afficherait `1`.

```c
}
```

Fin de la fonction.

---

## 5. Exo — Modifie le programme

### Exo 1 (obligatoire)

Modifie `hello.c` pour imprimer **deux** lignes au lieu d'une :

```
Apogee firmware online
Mode: SAFE
```

Compile avec `make` et relance avec `./hello`. Vérifie que tu as bien deux lignes.

> Indice : il te suffit d'ajouter un deuxième `printf`.

### Exo 2 (optionnel)

Fais en sorte que le programme retourne `42` au lieu de `0`. Compile, lance, puis fais `echo $?` — tu devrais voir 42.

### Exo 3 (optionnel) — Casser le programme

Enlève le `;` à la fin du `printf` et tape `make`. **Lis attentivement le message d'erreur du compilateur.** Le `gcc` te dira la ligne exacte où il a buté. C'est précieux : la moitié de ton temps en C, c'est lire des messages d'erreur.

Remets le `;` et recompile.

---

## 6. Et dans Apogée ?

Maintenant ouvre `apps/firmware/src/main.c` et regarde le tout début (avant la grosse logique) :

```c
#include "command.h"
#include "net.h"
...
#include <stdio.h>
#include <stdlib.h>
...

int main(void) {
    setvbuf(stderr, NULL, _IOLBF, 0);
    fprintf(stderr, "[BOOT] apogee firmware v0.3.0\n");
    ...
}
```

Tu reconnais la même structure que ton `hello.c` :
- Des `#include` au début
- Un `int main(void)`
- Des appels à `printf` (ici `fprintf(stderr, ...)` qui imprime sur l'erreur standard plutôt que la sortie standard, c'est tout)
- Un `return EXIT_SUCCESS;` à la fin (qui vaut `0`, défini dans `<stdlib.h>`)

**C'est exactement le même squelette.** Ton firmware est juste un `hello.c` avec beaucoup plus de logique entre `main {` et `return`.

---

## Récap

Tu sais maintenant :

- Compiler un fichier `.c` avec `gcc` (ou `make`)
- Lancer le binaire produit
- Que `main` est le point d'entrée
- Que `#include <xxx.h>` charge des déclarations standard
- Que `printf("...\n")` imprime
- Que `return N` retourne un code de sortie au shell
- La différence conceptuelle avec PHP/JS (compilé vs interprété)

Si l'un de ces 7 points est encore flou, **dis-le-moi avant de passer au chapitre 2.** On le re-décortique.

---

→ Chapitre 2 (à venir) : Variables et types
