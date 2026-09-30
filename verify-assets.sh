#!/usr/bin/env bash
# Vérifie que les fichiers binaires attendus par le code sont bien
# présents (assets historiques + grille et cadre de meilleur score de
# Meadow, partagés par tous les environnements + fonds d'écran d'accueil
# et de jeu des 4 thèmes). Les assets de grille et de compteur de
# meilleur score de glace ont été retirés (V2). À lancer depuis la
# racine de www/ :
#   bash verify-assets.sh

files=(
  "img/logo-gameblock.png"
  "img/tutorial-hand.png"
  "img/blocks/block-blue.png"
  "img/blocks/block-yellow.png"
  "img/blocks/block-green.png"
  "img/blocks/block-purple.png"
  "img/blocks/block-pink.png"
  "img/blocks/block-stone.png"
  "img/blocks/block-ice.png"
  "img/backgrounds/theme-default-bg.jpg"
  "img/backgrounds/theme-ice-bg.jpg"
  "img/backgrounds/theme-halloween-bg.jpg"
  "img/backgrounds/theme-hell-bg.jpg"
  "img/backgrounds/thumbs/theme-default-bg-thumb.jpg"
  "img/backgrounds/thumbs/theme-ice-bg-thumb.jpg"
  "img/backgrounds/thumbs/theme-halloween-bg-thumb.jpg"
  "img/backgrounds/thumbs/theme-hell-bg-thumb.jpg"
  "audio/drop.mp3"
  "audio/defaite.mp3"
  "audio/nice.mp3"
  "audio/great.mp3"
  "audio/awesome.mp3"
  "audio/amazing.mp3"
  "audio/unreal.mp3"
  "music.mp3"
  "img/grid/grid-meadow.png"
  "img/ui/best-score-meadow.png"
  "img/backgrounds/theme-default-game-bg.jpg"
  "img/backgrounds/theme-ice-game-bg.jpg"
  "img/backgrounds/theme-halloween-game-bg.jpg"
  "img/backgrounds/theme-hell-game-bg.jpg"
)

missing=0
for f in "${files[@]}"; do
  if [ -f "$f" ]; then
    echo "OK    $f"
  else
    echo "MANQUE $f"
    missing=$((missing + 1))
  fi
done

echo ""
if [ "$missing" -eq 0 ]; then
  echo "Tout est present (${#files[@]}/${#files[@]})."
else
  echo "$missing fichier(s) manquant(s) sur ${#files[@]}."
fi
