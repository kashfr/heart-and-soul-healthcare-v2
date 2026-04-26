#!/bin/bash
# regen-now-comp-blog-images.sh
#
# Regenerates the 4 images in the NOW/COMP blog post with authentic I/DD
# representation using OpenAI gpt-image-2 (high quality).
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

BLOG_DIR="/Users/kfreeman/Projects/heart-and-soul-healthcare-v2/public/images/blog"
[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }

# ── generate_image <prompt> <size> <output_path> ──────────────────────────────
generate_image() {
  local prompt="$1" size="$2" output="$3"
  local name
  name=$(basename "$output")

  # Append photorealism style cue automatically
  prompt="$prompt Photorealism, professional editorial photography, sharp focus, high detail."

  echo "  → $name  ($size)"

  local tmpfile
  tmpfile=$(mktemp)

  # Up to 3 attempts
  local attempt err
  for attempt in 1 2 3; do
    curl -s -X POST "https://api.openai.com/v1/images/generations" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg p "$prompt" --arg s "$size" \
           '{model: "gpt-image-2", prompt: $p, size: $s, quality: "medium", n: 1}')" \
      > "$tmpfile"

    err=$(jq -r '.error.message // empty' "$tmpfile" 2>/dev/null || echo "parse_error")
    [ -z "$err" ] && break
    [ "$attempt" = 3 ] && { echo "    ❌  Failed: $err"; rm -f "$tmpfile"; return 1; }
    echo "    ⏳  Retry $attempt: $err"
    sleep 8
  done

  jq -r '.data[0].b64_json // empty' "$tmpfile" | base64 -d > "$output"
  rm -f "$tmpfile"

  if [ ! -s "$output" ]; then
    echo "    ❌  Empty output"
    return 1
  fi
  echo "    ✓  Saved"
}

echo ""
echo "🖼   Regenerating NOW/COMP blog post images with gpt-image-2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Hero image (16:9) ────────────────────────────────────────────────────────
generate_image \
  "A warm and hopeful scene of a diverse Georgia family gathered together in a bright welcoming living room. The family includes parents in their 50s and their young adult son in his early 20s who has Down syndrome — he has the clearly visible facial features of Down syndrome including almond-shaped eyes, flat nasal bridge, and a gentle smile. The parents sit close to him with supportive, loving expressions. Natural window light streams in warmly from the side. Cozy living room with comfortable couch and family photos visible on walls. Mood is hopeful, loving, inclusive. Wide landscape composition." \
  "1792x1024" \
  "$BLOG_DIR/understanding-now-comp-waivers-georgia-hero.png"

# ─── Inline 1: family-home ────────────────────────────────────────────────────
generate_image \
  "A parent and her adult son with Down syndrome sharing a joyful moment together in their bright kitchen at home. The young man has clearly visible facial features of Down syndrome including almond-shaped eyes and a flat nasal bridge, and is smiling warmly. They are preparing breakfast together — he is stirring something in a bowl while she watches with a proud, loving expression. Warm natural window light pours in. The kitchen has plants on the windowsill and family photos on the fridge. Hopeful, loving atmosphere." \
  "1344x896" \
  "$BLOG_DIR/understanding-now-comp-waivers-georgia-family-home.png"

# ─── Inline 2: support-coordinator ────────────────────────────────────────────
generate_image \
  "A support coordinator meeting warmly with a family at their dining room table to review a care plan. The family includes parents and their adult daughter with Down syndrome in her mid-20s — she has the clearly visible facial features of Down syndrome including almond-shaped eyes and a gentle smile. The support coordinator is a professional woman in her 30s of Black or Latina heritage, smiling kindly while showing a printed plan. The young woman is engaged and pointing at the document with interest. Natural light through windows, cozy home dining room with art on walls. Compassionate, professional mood." \
  "1344x896" \
  "$BLOG_DIR/understanding-now-comp-waivers-georgia-support-coordinator.png"

# ─── Inline 3: community-activity ─────────────────────────────────────────────
generate_image \
  "A young adult with Down syndrome participating confidently and joyfully in a community group activity at a colorful inclusive community center. He is in his early 20s with clearly visible facial features of Down syndrome including almond-shaped eyes and a beaming smile. He is engaged in a group craft project, holding up his work proudly. Around him are diverse peers and a warm facilitator — including another participant who has a visible developmental disability. Bright community center with colorful art on walls, string lights overhead. Warm, hopeful atmosphere of belonging and inclusion." \
  "1344x896" \
  "$BLOG_DIR/understanding-now-comp-waivers-georgia-community-activity.png"

echo ""
echo "✅  All 4 NOW/COMP blog images regenerated."
echo ""
