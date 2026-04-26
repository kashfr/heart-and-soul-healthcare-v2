#!/bin/bash
# regen-caregiver-blog-images.sh
#
# Regenerates the 4 images in the caregiver self-care blog post
# using OpenAI gpt-image-2 (medium quality, photorealism).
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

  local tmpfile attempt err
  tmpfile=$(mktemp)

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
echo "🖼   Regenerating caregiver self-care blog images with gpt-image-2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Hero image (16:9) — peaceful caregiver self-care moment ──────────────────
generate_image \
  "A peaceful, restorative scene of a Black woman caregiver in her 50s taking a quiet moment of self-care for herself. She is sitting in a sunny kitchen nook by a window, holding a warm cup of tea with both hands, eyes gently closed in a moment of mindful pause. She wears comfortable casual clothes, hair loose. Soft warm morning light streams through sheer curtains, illuminating houseplants on the windowsill and a journal on the table. Mood is serene, restorative, hopeful. Wide landscape composition." \
  "1792x1024" \
  "$BLOG_DIR/caregiver-selfcare-hero.png"

# ─── Inline 1: respite-nurse ──────────────────────────────────────────────────
generate_image \
  "A respite nurse — a friendly Latina woman in her 30s wearing clean blue scrubs and carrying a small medical bag — arriving at the welcoming front porch of a suburban home in Georgia. The family caregiver, an Asian woman in her 40s, is greeting her at the open door with a relieved, grateful smile. The home is bright and inviting with potted plants beside the door. Warm afternoon sunlight bathes the scene. Mood is reassuring, professional, and warm — emphasizing the relief that respite care brings to family caregivers." \
  "1344x896" \
  "$BLOG_DIR/caregiver-respite-nurse.png"

# ─── Inline 2: support-group ──────────────────────────────────────────────────
generate_image \
  "A diverse caregiver support group seated in a circle of comfortable chairs in a warm, well-lit community room. The group includes a Black woman in her 60s, a white man in his 50s, a Latina woman in her 40s, and an Asian woman in her 30s — all sharing stories with attentive, empathetic expressions. One member is gesturing while speaking, while another listens with hand on heart. A small table with coffee cups and tissues is in the center. Soft natural light through large windows. Welcoming community center decor with plants and warm wood accents. Mood is supportive, intimate, healing." \
  "1344x896" \
  "$BLOG_DIR/caregiver-support-group.png"

# ─── Inline 3: walking-together ───────────────────────────────────────────────
generate_image \
  "An adult daughter in her 50s and her elderly mother in her 80s enjoying a peaceful morning walk together along a leafy neighborhood sidewalk. The daughter has her arm gently linked with her mother's, both smiling warmly at each other in conversation. The elderly mother has soft white hair and uses a simple walking cane. They are dressed in comfortable autumn clothing. Soft golden morning sunlight filters through tree leaves overhead, casting warm dappled light. Mood is loving, peaceful, intergenerational connection." \
  "1344x896" \
  "$BLOG_DIR/caregiver-walking-together.png"

echo ""
echo "✅  All 4 caregiver blog images regenerated."
echo ""
