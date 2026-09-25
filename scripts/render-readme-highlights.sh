#!/usr/bin/env bash
# The README's looping highlights, cut from the walkthrough: scripts/render-readme-highlights.sh [video] [gif]
set -euo pipefail

VIDEO="${1:-docs/assets/demo/bloom-demo.mp4}"
OUTPUT="${2:-docs/assets/readme/bloom-highlights.gif}"
# Seconds into the walkthrough: placing a widget, typing its settings, the roles, driving, the plots, the 3D view.
SEGMENTS="38-44 60-67 78-85 94-102 242-246 306-320"
SPEED=2.4

filters=""
inputs=""
count=0
for segment in ${SEGMENTS}; do
  filters+="[0:v]trim=start=${segment%-*}:end=${segment#*-},setpts=PTS-STARTPTS[s${count}];"
  inputs+="[s${count}]"
  count=$((count + 1))
done

ffmpeg -v error -y -i "${VIDEO}" -filter_complex \
  "${filters}${inputs}concat=n=${count}:v=1:a=0,setpts=PTS/${SPEED},fps=10,scale=800:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=128:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "${OUTPUT}"
echo "wrote ${OUTPUT}"
