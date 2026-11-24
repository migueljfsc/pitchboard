#!/usr/bin/env bash
# Draws the brand's raster files into public/ with headless Chrome.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$here/../../public"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

shot() { # page width height file
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor=1 --virtual-time-budget=3000 \
    --window-size="$2,$3" --screenshot="$out/$4" "file://$here/$1" 2>/dev/null
}

shot og.html 1200 630 og.png
# Chrome will not open a window this small, so the smaller sizes are scaled down from 512.
shot icon.html 512 512 icon-512.png
sips -z 192 192 "$out/icon-512.png" --out "$out/icon-192.png" >/dev/null
sips -z 180 180 "$out/icon-512.png" --out "$out/apple-touch-icon.png" >/dev/null
