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

# Fonds vidéo FACULTATIFS (services/visualtheme.js) : un .mp4 portant le
# même nom que l'image de fond remplace l'image à l'écran (l'image reste
# obligatoire : affiche + repli). 15 s maximum, même ratio que l'image.
# Informatif seulement : une vidéo absente n'est jamais comptée comme
# manquante. Si ffprobe est installé, la durée est contrôlée.
echo ""
echo "Fonds vidéo (facultatifs) :"
videos_found=0
for img in img/backgrounds/theme-*-bg.jpg img/backgrounds/theme-*-game-bg.jpg; do
  [ -f "$img" ] || continue
  vid="${img%.jpg}.mp4"
  if [ -f "$vid" ]; then
    videos_found=$((videos_found + 1))
    info=""
    if command -v ffprobe >/dev/null 2>&1; then
      dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$vid" 2>/dev/null)
      info=" (${dur%.*}s)"
      if [ -n "$dur" ] && [ "${dur%.*}" -gt 15 ]; then info="$info  ATTENTION : plus de 15 s"; fi
    fi
    echo "VIDEO $vid$info"
  fi
done
[ "$videos_found" -eq 0 ] && echo "  aucune (les images sont utilisées)"

echo ""
if [ "$missing" -eq 0 ]; then
  echo "Tout est present (${#files[@]}/${#files[@]})."
else
  echo "$missing fichier(s) manquant(s) sur ${#files[@]}."
fi
