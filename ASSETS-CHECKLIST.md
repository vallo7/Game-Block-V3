# Checklist des assets binaires attendus

**Aucun chemin existant n'a changé.** Le code référence toujours les
mêmes 25 fichiers historiques, aux mêmes emplacements. Le moteur
d'environnements a ajouté 4 fichiers (grilles + cadres du bouton
meilleur score), et les écrans de chargement en ajoutent 2 de plus
(fonds d'écran dédiés à l'écran de jeu) — le total attendu est donc de
**31 fichiers**.

Un script de vérification est fourni : `verify-assets.sh`. Lance-le
depuis la racine de ton `www/` (une fois `img/`/`audio/` fusionnés
dedans, comme le fait déjà le pipeline GitHub Actions) :

```bash
bash verify-assets.sh
```

Il te dira lesquels de ces 31 fichiers manquent, le cas échéant.

## Liste complète (31 fichiers)

```
www/img/logo-gameblock.png
www/img/tutorial-hand.png
www/img/blocks/block-blue.png
www/img/blocks/block-yellow.png
www/img/blocks/block-green.png
www/img/blocks/block-purple.png
www/img/blocks/block-pink.png
www/img/blocks/block-stone.png
www/img/blocks/block-ice.png
www/img/backgrounds/theme-default-bg.jpg
www/img/backgrounds/theme-ice-bg.jpg
www/img/backgrounds/theme-halloween-bg.jpg
www/img/backgrounds/theme-hell-bg.jpg
www/img/backgrounds/thumbs/theme-default-bg-thumb.jpg
www/img/backgrounds/thumbs/theme-ice-bg-thumb.jpg
www/img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg
www/img/backgrounds/thumbs/theme-hell-bg-thumb.jpg
www/audio/drop.mp3
www/audio/defaite.mp3
www/audio/nice.mp3
www/audio/great.mp3
www/audio/awesome.mp3
www/audio/amazing.mp3
www/audio/unreal.mp3
www/music.mp3
www/img/grid/grid-meadow.png
www/img/grid/grid-ice.png
www/img/ui/best-score-meadow.png
www/img/ui/best-score-ice.png
www/img/backgrounds/theme-default-game-bg.jpg
www/img/backgrounds/theme-ice-game-bg.jpg
```

## Moteur d'environnements — grilles et cadre du bouton meilleur score

| Fichier | Utilisé pour | Environnement |
|---|---|---|
| `img/grid/grid-meadow.png` | Asset de grille dessiné dans le canvas de jeu | Meadow |
| `img/grid/grid-ice.png` | Asset de grille dessiné dans le canvas de jeu | Ice |
| `img/ui/best-score-meadow.png` | Cadre du bouton "meilleur score" (écran de jeu) | Meadow |
| `img/ui/best-score-ice.png` | Cadre du bouton "meilleur score" (écran de jeu) | Ice |

## Écrans de chargement — fonds d'écran dédiés à l'écran de jeu

| Fichier | Utilisé pour | Thème |
|---|---|---|
| `img/backgrounds/theme-default-game-bg.jpg` | Fond de l'écran de jeu (sans décor animé en boucle) | Meadow |
| `img/backgrounds/theme-ice-game-bg.jpg` | Fond de l'écran de jeu (sans décor animé en boucle) | Ice |

Le fond `theme-*-bg.jpg` existant reste utilisé pour l'écran d'accueil
(avec le décor animé en boucle par-dessus) ; `theme-*-game-bg.jpg` est
un fond **distinct**, propre à l'écran de jeu, sans ce décor.

**Où placer tous ces nouveaux fichiers :** exactement comme
`img/blocks/` et `img/backgrounds/` aujourd'hui — à la racine du
dépôt, dans `img/grid/`, `img/ui/` et `img/backgrounds/` (PAS dans
`www/`). Le job GitHub Actions existant (`Prepare www assets`) copie
déjà tout `img/` récursivement dans `www/img/` avant le build ; ces
sous-dossiers seront donc automatiquement inclus sans aucune
modification du workflow.

Les deux assets de grille doivent être des images carrées (l'affichage
détecte et rogne automatiquement leur zone opaque avant de l'étirer
aux dimensions du plateau, qui est toujours un carré 8×8).

## Pourquoi ça a cassé la dernière fois (Phase 1)

La livraison précédente ne contenait que `www/js/`, `www/css/` et
`www/index.html` (les seuls fichiers modifiés par la Phase 1). Si le
dossier `www/` a été **remplacé en entier** par celui du zip plutôt
que **fusionné** avec l'existant, `img/`, `audio/` et `music.mp3` ont
disparu — ce qui explique exactement les symptômes vus à l'époque :
logo cassé au splash/menu, blocs qui retombent sur un aplat de couleur
uni, gant du tutoriel invisible.

La bonne manip, à chaque livraison : dézippe-la dans un dossier à
part, puis copie manuellement son contenu `www/js/`, `www/css/` et
`www/index.html` **par-dessus** ton `www/` existant, et les éventuels
nouveaux sous-dossiers `img/...` **à la racine** du dépôt — sans
jamais toucher à `www/img/`, `www/audio/` ni `www/music.mp3`
directement (ils sont reconstruits par le pipeline de build).
