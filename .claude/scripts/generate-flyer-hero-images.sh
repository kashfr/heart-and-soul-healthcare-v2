#!/bin/bash
# generate-flyer-hero-images.sh
#
# Generates 4 hero image variations (1024x1024 square) for the NOW/COMP flyer
# using OpenAI gpt-image-2. Variations 1-2 use the base prompt; variations 3-4
# add the editorial documentary style modifier. Outputs JPG.
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$PROJECT_DIR/public/images"
QUALITY="${OPENAI_IMAGE_QUALITY:-medium}"
SIZE="1024x1024"

[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }
mkdir -p "$OUT_DIR"

BASE_PROMPT='Photorealistic square photograph, soft natural window light from camera-left. A warm, candid moment between a Black female registered nurse in her 30s wearing navy blue scrubs (no logos, no name tag) and a seated adult man in his late 20s with a developmental disability. They are in the living room of a comfortable, lived-in middle-class home — visible details include a soft beige sofa, a side table with a lamp, a small potted plant, and a framed family photo slightly out of focus in the background. The nurse is kneeling or seated at eye level with the participant, smiling gently while taking his blood pressure with a manual cuff, fully engaged and attentive. The participant looks relaxed, dignified, and at ease — a small genuine smile, not posed. Composition: medium shot, nurse and participant both clearly visible, slight depth of field with the background softly blurred. Color grading: warm and inviting with subtle navy and cream tones, no harsh contrasts, gentle film-like quality. Mood: trust, dignity, in-home professional care. Avoid: stock-photo stiffness, fake smiles, exaggerated expressions, medical equipment overload, hospital settings, scrubs with brand logos, text or watermarks of any kind, distorted hands, extra fingers.'

EDITORIAL_MODIFIER=' Editorial documentary style, shot on Fujifilm X-T5, 35mm lens, f/2.8.'

# ── generate_image <prompt> <output_jpg_path> ────────────────────────────────
generate_image() {
  local prompt="$1" output="$2"
  local name png_tmp tmpfile attempt err
  name=$(basename "$output")
  png_tmp="${output%.jpg}.png"

  echo "  → $name  ($SIZE, quality=$QUALITY)"
  tmpfile=$(mktemp)

  for attempt in 1 2 3; do
    curl -s -X POST "https://api.openai.com/v1/images/generations" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg p "$prompt" --arg s "$SIZE" --arg q "$QUALITY" \
           '{model: "gpt-image-2", prompt: $p, size: $s, quality: $q, n: 1}')" \
      > "$tmpfile"

    err=$(jq -r '.error.message // empty' "$tmpfile" 2>/dev/null || echo "parse_error")
    [ -z "$err" ] && break
    [ "$attempt" = 3 ] && { echo "    ❌  Failed after 3 attempts: $err"; rm -f "$tmpfile"; return 1; }
    echo "    ⏳  Retry $attempt: $err"
    sleep 8
  done

  jq -r '.data[0].b64_json // empty' "$tmpfile" | base64 -d > "$png_tmp"
  rm -f "$tmpfile"

  if [ ! -s "$png_tmp" ]; then
    echo "    ❌  Empty PNG output"
    return 1
  fi

  # PNG → JPG (macOS sips, quality 92)
  sips -s format jpeg -s formatOptions 92 "$png_tmp" --out "$output" >/dev/null
  rm -f "$png_tmp"

  echo "    ✓  Saved $(du -h "$output" | cut -f1)"
}

echo ""
echo "🖼   Generating 4 flyer hero variations with gpt-image-2"
echo "    Output: $OUT_DIR"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

generate_image "$BASE_PROMPT"                       "$OUT_DIR/flyer-hero-1.jpg"
generate_image "$BASE_PROMPT"                       "$OUT_DIR/flyer-hero-2.jpg"
generate_image "${BASE_PROMPT}${EDITORIAL_MODIFIER}" "$OUT_DIR/flyer-hero-3.jpg"
generate_image "${BASE_PROMPT}${EDITORIAL_MODIFIER}" "$OUT_DIR/flyer-hero-4.jpg"

echo ""
echo "✅  Done. 4 hero variations saved to public/images/"
echo ""
