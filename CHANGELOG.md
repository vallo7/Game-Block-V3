# Game Block — Journal des modifications (8e passe)

Ce paquet ne contient QUE les fichiers ajoutés ou modifiés, avec exactement
la même arborescence que le dépôt (`www/...`, `img/...`). Aucun autre
fichier du projet n'a été touché : il suffit de copier ce contenu par-dessus
le dépôt existant (ou de faire un commit avec ces chemins) pour appliquer
toutes les demandes ci-dessous.

## Fichiers modifiés/ajoutés

```
www/index.html
www/css/game.css
www/css/loading.css
www/css/marketplace-page.css
www/css/menu.css
www/css/quest-page.css
www/css/trophy-page.css
www/js/config/gameConfig.js
www/js/core/game-state.js
www/js/services/achievements.js
www/js/services/environment.js
www/js/services/i18n.js
www/js/services/loader.js
www/js/services/quests.js
www/js/services/visualtheme.js
www/js/ui/loading.js
www/js/ui/quests.js
www/js/ui/trophies.js
img/backgrounds/theme-default-bg.jpg          (remplacé)
img/backgrounds/theme-default-game-bg.jpg     (remplacé)
img/backgrounds/theme-halloween-bg.jpg        (remplacé)
img/backgrounds/theme-halloween-game-bg.jpg   (remplacé)
img/backgrounds/theme-hell-bg.jpg             (remplacé)
img/backgrounds/theme-hell-game-bg.jpg        (remplacé)
img/backgrounds/theme-ice-bg.jpg              (remplacé)
img/backgrounds/theme-ice-game-bg.jpg         (remplacé)
img/backgrounds/thumbs/theme-default-bg-thumb.jpg   (régénéré)
img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg (régénéré)
img/backgrounds/thumbs/theme-hell-bg-thumb.jpg      (régénéré)
img/backgrounds/thumbs/theme-ice-bg-thumb.jpg       (régénéré)
```

Les anciens `img/grid/grid-ice.png` et `img/ui/best-score-ice.png` restent
dans le dépôt (rien à supprimer) mais ne sont plus référencés par le code —
ils peuvent être retirés plus tard si tu le souhaites, ou gardés pour un
usage futur.

---

## 1. Grille et compteur de meilleur score unifiés

Tous les environnements (Meadow ET Ice) utilisent désormais :
- la grille `img/grid/grid-meadow.png`
- le cadre de compteur de meilleur score `img/ui/best-score-meadow.png`

→ `services/environment.js` : deux nouvelles constantes
`SHARED_GRID_ASSET` / `SHARED_BEST_SCORE_FRAME`, utilisées par les deux
environnements (un seul endroit à modifier si tu changes d'avis plus tard).
→ `css/game.css` : la règle `.env-ice .best-score` (cadre Ice) a été
retirée ; un seul cadre pour `.best-score`, quel que soit l'environnement.
→ Bonus perf (§13) : comme les deux environnements pointent maintenant vers
la même image, le chargement dédoublonne désormais les images identiques
(voir point 13) au lieu de recréer deux objets Image pour la même URL.

## 2. Barre de chargement classique et fun

Les 8 mini-blocs sont remplacés par une vraie barre de progression
(`www/css/loading.css`, `www/js/ui/loading.js`, markup dans `index.html`) :
- piste arrondie façon "candy" (même langage que le reste du jeu) ;
- remplissage en dégradé arc-en-ciel qui défile en continu, avec des
  bandes diagonales qui glissent par-dessus et un reflet qui balaie la
  barre ;
- une étincelle lumineuse pulsante suit la pointe du remplissage ;
- un pourcentage flotte doucement sous la barre ;
- un petit "bump" élastique anime la piste et l'étincelle à chaque palier
  de 10% franchi.

La progression reste branchée sur le vrai chargement des assets
(`services/loader.js`), exactement comme avant.

## 3. Entrée/sortie de l'écran de chargement : glissade + rebond "bulle"

L'ancien effet "cercle qui s'ouvre" (clip-path) est remplacé par une vraie
glissade :
- **Entrée** : l'écran tombe du haut de l'écran vers le bas, avec un effet
  d'atterrissage élastique (léger étirement puis écrasement, comme une
  bulle qui rebondit avant de se stabiliser) ;
- **Sortie** : l'écran s'écrase légèrement (anticipation), puis file vers
  le haut et sort de l'écran par le haut, en s'étirant.

Un flash lumineux discret accompagne l'atterrissage (entrée) et le
décollage (sortie), comme avant. Tout est en CSS (`@keyframes
loadingScreenEnter` / `loadingScreenExit`), `ui/loading.js` ne fait que
poser/retirer les classes `.entering` / `.leaving` / `.hidden` au bon
moment, avec des minuteurs qui s'annulent proprement si `show()`/`hide()`
sont appelés coup sur coup (ex. deux transitions rapprochées) — plus aucun
risque de laisser l'écran figé à mi-course.

## 4. Trophées / Marketplace / Quêtes : plus d'air sur les bords

Les trois écrans (qui partagent `.drawer-screen`) ont une marge latérale
augmentée (14px → 22px, hors zone de sécurité du téléphone), et les
éléments à l'intérieur (icônes, cartes, textes, puces) ont été réduits
d'environ 10 à 15% — juste assez pour dégager les bords sans perdre en
lisibilité (tailles de police jamais descendues sous 10px).

## 5. Quêtes : participation par quête + réinitialisation liée à la complétion

Refonte du cycle de vie des quêtes (`services/quests.js`, `ui/quests.js`) :

- **Participation explicite** : chaque quête affiche un bouton **Rejoindre**
  tant que le joueur n'a pas choisi d'y participer. Une quête ne progresse
  (et ne peut donc être complétée) qu'à partir du moment où elle est
  rejointe — plus d'activation globale du menu qui faisait progresser
  toutes les quêtes d'un coup.
  - Cas limite traité : pour les quêtes "score" et "combo" (qui retiennent
    la meilleure valeur d'UNE partie), seule une partie *démarrée après*
    la participation est prise en compte, pour qu'une partie déjà en cours
    ne puisse pas "pré-remplir" une quête qu'on vient tout juste de
    rejoindre.
- **Réinitialisation liée à la complétion, pas au temps** : le compte à
  rebours de 12h ne démarre plus automatiquement à la génération de la
  liste. Il démarre uniquement une fois que **les 5 quêtes du cycle sont
  toutes complétées**. À l'échéance des 12h, la liste entière est
  redistribuée (nouveau tirage — les quêtes peuvent donc changer). Tant
  que les 5 ne sont pas complétées, aucun décompte ne tourne, même après
  plusieurs jours.
- L'en-tête de l'écran Quêtes affiche soit le compte à rebours (une fois
  démarré), soit une invitation ("Termine les 5 quêtes pour lancer le
  compte à rebours") — dans une pastille dédiée sous l'en-tête plutôt que
  dans son étroite 3e colonne d'origine, pour ne jamais tronquer le texte.
  L'écran se redessine automatiquement si la réinitialisation survient
  pendant qu'il est ouvert.
- Robustesse : l'état sauvegardé porte désormais un numéro de version ; un
  ancien format ou un état corrompu est régénéré proprement plutôt que de
  faire planter l'écran.

Toute cette logique a été testée par un script de bout en bout (participation,
progression, complétion, démarrage du décompte à 5/5 (jamais à 4/5), non
réinitialisation avant échéance, réinitialisation propre à l'échéance,
persistance, migration d'un ancien état) — tous les cas passent.

## 6. Mise en avant animée : bouton Marketplace + boutons "Watch Ad"

- Le bouton Marketplace de l'accueil a maintenant, en plus de son halo doré
  existant, un petit rebond ludique en boucle (`@keyframes ctaBounce`,
  `css/menu.css`) qui attire clairement l'œil.
  (Note technique : l'animation d'entrée du bouton écrasait silencieusement
  cette boucle après l'arrivée sur le menu — corrigé en même temps.)
- Le même rebond a été ajouté aux boutons **"Watch Ad"** littéraux : celui
  de la Marketplace (*Watch an Ad*) et celui des Quêtes (quêtes
  complétables par pub).

## 7. Logo de l'accueil agrandi

`width: min(42vw, 158px)` → `min(47vw, 176px)`.

## 8-9. Boutons Classic / Adventure : descendus et légèrement réduits

- Descendus : `margin-top: 30px` ajouté au-dessus de la liste des modes.
- Réduits (~10-12%) pour améliorer la lisibilité : padding, icône et taille
  du texte diminués légèrement (le texte garde une bonne taille, rien en
  dessous de 18.5px).

## 10. Nouveaux fonds d'écran par thème (nouveau format)

Les 8 nouvelles images fournies (1086×2288, format portrait plein écran)
ont remplacé les anciennes. Comme le code affichait déjà ces fonds en
`background-size: cover` partout, aucun changement de code n'était
nécessaire pour qu'ils s'affichent correctement en plein écran.

En revanche les 4 **vignettes** (`thumbs/*.jpg`, utilisées dans le
carrousel Thèmes et les cartes Marketplace) ne sont pas fournies par un
fond seul : elles ont été régénérées à partir des nouvelles images, avec un
recadrage centré sur le château de chaque thème (vérifié visuellement pour
les 4).

## 11. Prix uniforme des thèmes en vente : 2500 Coins

`Halloween` et `Inferno` coûtent désormais chacun 2500 Coins (au lieu de
1800/2500). Une constante `MARKETPLACE.DEFAULT_THEME_PRICE = 2500` a été
ajoutée dans `gameConfig.js` : un futur thème payant ajouté sans prix
explicite retombera automatiquement sur 2500 au lieu de planter avec un
prix `undefined`. `Frozen` reste un thème à condition (combo x8), pas à
l'achat, donc non concerné.

## 12. Système d'étoiles étendu à deux trophées supplémentaires

Deux familles de trophées qui comptaient chacune **exactement 3 paliers**
ont été converties en trophées à étoiles (mêmes seuils, mêmes récompenses
qu'avant — rien n'est plus dur ni plus facile à obtenir, seule la
présentation change, à l'identique du système déjà en place pour
Dedicated/Personal Best/Divine Streak) :

- **Endurance** : Marathoner (900) / Iron Will (2 400) / Eternal (4 500)
  tours → un seul trophée **Marathoner ★★★** (35 / 100 / 200 Coins).
- **Dédicace (lignes)** : Line Cutter (750) / Line Master (7 500) / Line
  Overlord (30 000) lignes → un seul trophée **Line Cutter ★★★**
  (25 / 90 / 220 Coins).

Les familles à 4 paliers (Score, Perfect Clear, Combo) et les trophées
binaires/secrets restent inchangés, conformément à la logique déjà
documentée dans `achievements.js` (l'UI à étoiles est conçue pour
exactement 3 paliers).

## 13. Performance et robustesse

- **`services/loader.js`** : les images identifiées par une URL (fonds de
  thème, cadre de meilleur score, grille...) sont désormais mises en cache
  par URL — une même image n'est plus jamais rechargée/re-décodée deux
  fois pendant la session, y compris d'une transition menu ↔ jeu à
  l'autre. Une image en échec (réseau, 404) n'est pas mise en cache : elle
  sera retentée normalement au prochain appel.
- **`core/game-state.js`** : la grille (désormais partagée par tous les
  environnements) n'est plus chargée en double : un seul objet `Image` est
  créé et réutilisé pour tous les environnements qui pointent vers la même
  URL.
- **`services/quests.js`** : état persisté versionné (`STATE_VERSION`),
  régénéré proprement si absent, corrompu ou d'un ancien format — jamais de
  plantage sur une donnée inattendue.
- **`ui/loading.js`** : minuteurs d'animation toujours annulés avant d'en
  reposer un nouveau — deux transitions d'écran rapprochées ne peuvent plus
  laisser le rideau de chargement dans un état incohérent.
- **`services/visualtheme.js`** : le prix d'un thème retombe sur
  `MARKETPLACE.DEFAULT_THEME_PRICE` si absent de `THEME_PRICES` (voir §11).

---

## Vérifications effectuées

- Tous les fichiers JS modifiés relus intégralement + vérifiés
  syntaxiquement (`node --check`).
- Tous les imports relatifs du projet reconstitué résolus avec succès.
- Toutes les feuilles CSS modifiées vérifiées équilibrées (accolades).
- `index.html` vérifié équilibré (div/section/button) après l'édition de
  l'écran de chargement.
- Logique des quêtes (participation, progression, complétion, décompte à
  5/5 uniquement, réinitialisation à l'échéance, persistance, migration)
  validée par un script de tests dédié — tous les cas passent.
- Trophées à étoiles (Marathoner, Line Cutter) validés par un script de
  tests dédié (paliers, non-régression des étoiles, récompenses,
  réclamation) — tous les cas passent.
- Déduplication du `Loader` validée par un script de tests dédié (URLs
  répétées, cache, échecs non mis en cache) — tous les cas passent.
- Toutes les clés `i18n` (EN + FR) utilisées par le nouveau code vérifiées
  présentes et correctement substituées.
- Les 4 nouvelles vignettes de thème vérifiées visuellement (cadrage sur
  le château de chaque thème).

Ce que je n'ai **pas** touché volontairement, pour rester au périmètre
demandé : le cœur de jeu Classic (grille, difficulté, score, obstacles),
le système de pub, l'économie de Coins (hors prix des thèmes), le tutoriel,
et tous les fichiers non listés ci-dessus.
