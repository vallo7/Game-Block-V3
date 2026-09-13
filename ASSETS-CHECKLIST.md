# Checklist des assets binaires attendus

**Aucun chemin n'a changé.** Le code référence exactement les mêmes fichiers,
aux mêmes emplacements, qu'avant la Phase 1. Le zip de code ne contient ni
images ni sons (ils n'ont jamais bougé) — cette liste sert à vérifier que ton
dossier `www/` les a toujours, à côté du nouveau `js/`, `css/` et `index.html`.

Un script de vérification est fourni : `verify-assets.sh`. Lance-le depuis la
racine de ton `www/` :

```bash
bash verify-assets.sh
```

Il te dira lesquels de ces 25 fichiers manquent, le cas échéant.

## Liste complète (25 fichiers)

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
```

## Pourquoi ça a cassé la dernière fois

La livraison précédente ne contenait que `www/js/`, `www/css/` et
`www/index.html` (les seuls fichiers modifiés par la Phase 1). Si le dossier
`www/` a été **remplacé en entier** par celui du zip plutôt que **fusionné**
avec l'existant, `img/`, `audio/` et `music.mp3` ont disparu — ce qui explique
exactement les symptômes vus sur les captures : logo cassé au splash/menu,
blocs qui retombent sur un aplat de couleur uni (le filet de sécurité déjà
prévu dans le code s'est déclenché, `drawCellAt()` bascule sur `fillStyle`
quand l'image ne charge pas), et le gant du tutoriel invisible.

La bonne manip cette fois : dézippe `gameblock-phase1-fixes.zip` dans un
dossier à part, puis copie manuellement son contenu `www/js/`, `www/css/` et
`www/index.html` **par-dessus** ton `www/` existant — sans toucher à
`www/img/`, `www/audio/` ni `www/music.mp3`.
