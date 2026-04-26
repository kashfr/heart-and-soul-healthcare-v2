#!/bin/bash
# regen-now-comp-images.sh
#
# Regenerates the NOW/COMP program page images with authentic I/DD
# representation using OpenAI gpt-image-2.
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

PUBLIC_DIR="/Users/kfreeman/Projects/heart-and-soul-healthcare-v2/.claude/image-previews"
[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }

# ── generate_image <prompt> <size> <output_path> ──────────────────────────────
generate_image() {
  local prompt="$1" size="$2" output="$3"
  local name
  name=$(basename "$output")

  echo "  → $name  ($size)"

  local tmpfile
  tmpfile=$(mktemp)

  curl -sf -X POST "https://api.openai.com/v1/images/generations" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$prompt" --arg s "$size" \
         '{model: "gpt-image-2", prompt: $p, size: $s, quality: "high", n: 1}')" \
    > "$tmpfile" || {
    echo "    ❌  API request failed"
    cat "$tmpfile"
    rm -f "$tmpfile"
    return 1
  }

  local err
  err=$(jq -r '.error.message // empty' "$tmpfile")
  if [ -n "$err" ]; then
    echo "    ❌  API error: $err"
    rm -f "$tmpfile"
    return 1
  fi

  jq -r '.data[0].b64_json // empty' "$tmpfile" | base64 -d > "$output"
  rm -f "$tmpfile"

  if [ ! -s "$output" ]; then
    echo "    ❌  Empty output"
    return 1
  fi
  echo "    ✓  Saved"
}

echo ""
echo "🖼   Regenerating NOW/COMP I/DD images with gpt-image-2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Population image — community engagement
generate_image \
  "Editorial photograph of a young adult man with Down syndrome in his mid-20s sitting at a community center table, engaged in warm conversation with a female support coordinator. He has the clearly visible facial features of Down syndrome including almond-shaped eyes, flat nasal bridge, and a gentle smile. He is wearing a casual plaid button-up shirt and has a pen in his hand reviewing a printed plan. The support coordinator beside him is a professional woman in her 30s of Black or Latina heritage, smiling kindly. Bright community center with colorful posters in the background. Warm natural window light streams in from the left. Mood is inclusive, respectful, empowering. Professional editorial photography, warm tones, shallow depth of field." \
  "1344x896" \
  "$PUBLIC_DIR/now-comp-population.png"

# Goal image — supported employment / independence
generate_image \
  "Editorial photograph of a young woman with Down syndrome in her early 20s, proudly working behind the counter of a welcoming neighborhood bakery. She has the clearly visible facial features of Down syndrome including almond-shaped eyes and a flat nasal bridge, with warm brown hair pulled back. She is wearing a clean beige apron over a light blouse and is handing a paper bag to a customer with a beaming, confident smile. Wooden shelves with fresh bread and pastries in the soft-focus background, warm pendant lighting overhead. A job coach is visible in the blurred background giving quiet support. Mood is empowering, dignified, joyful. Professional editorial photography, warm tones, natural lighting." \
  "1344x896" \
  "$PUBLIC_DIR/now-comp-goal.png"

# NEW Hero/slide — community art class
generate_image \
  "Wide editorial photograph of a diverse, inclusive art class at a community center. In the foreground, a young adult with Down syndrome in his late teens or early 20s, wearing a blue t-shirt splattered with paint, is laughing while painting on a canvas. He has clearly visible facial features of Down syndrome. Around him are peers of different backgrounds — a young Black woman also painting, an older participant with a visible developmental disability smiling at her work, and a warm facilitator guiding the group. Colorful art supplies, bright windows, string lights above. Mood is joyful, vibrant, inclusive, celebratory of neurodiversity. Professional editorial photography, warm natural light, shallow depth of field, wide landscape composition." \
  "1792x1024" \
  "$PUBLIC_DIR/now-comp-slide.png"

echo ""
echo "✅  Done. Images saved to public/images/"
echo ""
