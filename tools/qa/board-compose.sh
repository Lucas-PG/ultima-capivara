#!/bin/zsh
# Before and after boards from two board-capture.mjs folders (same cameras, same order).
# tools/qa/board-compose.sh <beforeDir> <afterDir> <outDir> [cropX cropY]
#   <name>-full.jpg: both whole frames side by side at a third of their size (the HUD included).
#   <name>-crop.jpg: the same 640x480 region of each frame at 1:1 Retina pixels.
set -e
before=$1; after=$2; out=$3
mkdir -p "$out"
for image in "$after"/*.png; do
  name=${image:t:r}
  [[ -f "$before/$name.png" ]] || continue
  # Crop around the screen centre-right, where the held weapon, the crosshair target and the street meet.
  x=${4:-1240}; y=${5:-760}
  for side in before after; do
    src=$([[ $side == before ]] && echo "$before/$name.png" || echo "$image")
    magick "$src" -resize 33.333% -gravity north -background '#1d1a17' -splice 0x34 -font /System/Library/Fonts/Supplemental/Arial.ttf -fill white -pointsize 22 -annotate +0+5 "$side" "$out/.$side-full.png"
    magick "$src" -crop 640x480+$x+$y +repage -gravity north -background '#1d1a17' -splice 0x34 -font /System/Library/Fonts/Supplemental/Arial.ttf -fill white -pointsize 22 -annotate +0+5 "$side, 1:1" "$out/.$side-crop.png"
  done
  magick "$out/.before-full.png" "$out/.after-full.png" +append -quality 80 "$out/$name-full.jpg"
  magick "$out/.before-crop.png" "$out/.after-crop.png" +append -quality 85 "$out/$name-crop.jpg"
done
rm -f "$out"/.before-*.png "$out"/.after-*.png
