#!/bin/zsh
# Usage: scripts/shot.sh <path-after-host> <out.png> [width] [height] [wait-ms]
#   scripts/shot.sh '/#/tws' .shots/tws.png 1440 900 5000
#   scripts/shot.sh '/sandbox/render.html' .shots/render.png
# Needs the dev server on :5190 (starts one if missing). Prints browser console messages.
# To log from a page for this script, use console.error / console.warn / console.log (all captured).
set -u
URLPATH=${1:-/}; OUT=${2:-.shots/shot.png}; W=${3:-1440}; H=${4:-900}; WAIT=${5:-5000}
cd "$(dirname "$0")/.."
[[ "$OUT" = /* ]] || OUT="$PWD/$OUT"
mkdir -p "$(dirname "$OUT")"
if ! curl -s -o /dev/null http://localhost:5190/; then
  (npx vite --port 5190 --strictPort > /tmp/fox3academy-vite.log 2>&1 &)
  for i in {1..40}; do curl -s -o /dev/null http://localhost:5190/ && break; sleep 0.25; done
fi
# Headless Chrome lays out at >= 500 CSS px. For phone widths, host the page in an iframe of the real
# width and crop the screenshot afterwards.
REALW=$W; TARGET="$URLPATH"
if (( W < 500 )); then
  ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1], safe=""))' "$URLPATH")
  TARGET="/sandbox/frame.html?w=$W&h=$H&src=$ENC"
  W=500
fi
PROFILE=$(mktemp -d /tmp/fox3academy-chrome.XXXXXX)
LOG="$PROFILE.log"
rm -f "$OUT"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
  --hide-scrollbars --window-size=$W,$H --virtual-time-budget=$WAIT --enable-logging=stderr --v=0 \
  --screenshot="$OUT" "http://localhost:5190$TARGET" > "$LOG" 2>&1 &
PID=$!
LIMIT=$(( WAIT / 1000 + 25 ))
for i in $(seq 1 $(( LIMIT * 4 ))); do
  if ! kill -0 $PID 2>/dev/null; then break; fi
  if [[ -s "$OUT" ]]; then sleep 1; kill $PID 2>/dev/null; break; fi
  sleep 0.25
done
kill -9 $PID 2>/dev/null
pkill -f "$PROFILE" 2>/dev/null
grep -E 'CONSOLE|Uncaught' "$LOG" | grep -v -E 'GL Driver Message|\[vite\]' | sed -E 's/^.*(CONSOLE)/\1/' | head -40
rm -rf "$PROFILE" "$LOG"
if [[ -s "$OUT" ]] && (( REALW < 500 )); then
  if command -v magick >/dev/null 2>&1; then
    magick "$OUT" -crop "${REALW}x${H}+0+0" +repage "$OUT" || exit 1
  elif python3 -c 'from PIL import Image' 2>/dev/null; then
    python3 -c 'import sys;from PIL import Image;p=sys.argv[1];w=int(sys.argv[2]);h=int(sys.argv[3]);im=Image.open(p);im.crop((0,0,min(w,im.width),min(h,im.height))).save(p)' "$OUT" $REALW $H || exit 1
  else
    echo "Phone crop requires ImageMagick (magick) or Python Pillow; uncropped screenshot: $OUT" >&2
    exit 1
  fi
fi
[[ -s "$OUT" ]] && echo "saved $OUT ($REALW x $H)" || echo "NO SCREENSHOT (timeout)"
