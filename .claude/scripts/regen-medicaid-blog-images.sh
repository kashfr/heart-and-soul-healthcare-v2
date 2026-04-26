#!/bin/bash
# regen-medicaid-blog-images.sh
#
# Regenerates the 4 images in the Medicaid application blog post
# using OpenAI gpt-image-2 (medium quality, photorealism).
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

BLOG_DIR="/Users/kfreeman/Projects/heart-and-soul-healthcare-v2/public/images/blog"
[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }

generate_image() {
  local prompt="$1" size="$2" output="$3"
  local name
  name=$(basename "$output")

  prompt="$prompt Photorealism, professional editorial photography, sharp focus, high detail."

  echo "  → $name  ($size)"

  local tmpfile attempt err
  tmpfile=$(mktemp)

  local curl_exit
  for attempt in 1 2 3 4 5; do
    set +e
    curl -s -X POST "https://api.openai.com/v1/images/generations" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg p "$prompt" --arg s "$size" \
           '{model: "gpt-image-2", prompt: $p, size: $s, quality: "medium", n: 1}')" \
      > "$tmpfile"
    curl_exit=$?
    set -e

    if [ "$curl_exit" -ne 0 ]; then
      [ "$attempt" = 5 ] && { echo "    ❌  curl failed (exit $curl_exit) after 5 tries"; rm -f "$tmpfile"; return 1; }
      echo "    ⏳  Retry $attempt: curl exit $curl_exit (network)"
      sleep 8
      continue
    fi

    err=$(jq -r '.error.message // empty' "$tmpfile" 2>/dev/null || echo "parse_error")
    [ -z "$err" ] && break
    [ "$attempt" = 5 ] && { echo "    ❌  Failed: $err"; rm -f "$tmpfile"; return 1; }
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
echo "🖼   Regenerating Medicaid application blog images with gpt-image-2"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ─── Hero (16:9) — Family completing Medicaid application ────────────────────
generate_image \
  "A warm, hopeful scene of a Black family in Georgia gathered together at their kitchen table working on their Medicaid application. A mother in her 40s is using a laptop while her teenage daughter helps point at the screen. Her husband sits beside her with a stack of organized documents and a calculator, looking focused but optimistic. Bright morning sunlight streams through a kitchen window with potted herbs on the sill. The home is warm and inviting with family photos visible in the background. Mood is supportive, hopeful, capable. Wide landscape composition." \
  "1792x1024" \
  "$BLOG_DIR/medicaid-application-hero.png"

# ─── Inline 1: family-reviewing-documents ────────────────────────────────────
generate_image \
  "A multigenerational Hispanic family in their cozy living room reviewing important medical and insurance documents together. An adult daughter in her 30s sits on a comfortable couch beside her elderly father in his 70s, both looking at a folder of papers spread on the coffee table. A medical insurance card and prescription bottles are visible alongside the documents. Warm afternoon light filters through curtains. The mood is collaborative, reassuring, and focused — a family working together to navigate healthcare paperwork." \
  "1344x896" \
  "$BLOG_DIR/family-reviewing-documents.png"

# ─── Inline 2: medicaid-card-documents ───────────────────────────────────────
generate_image \
  "A close-up overhead shot of a person's hands holding a Georgia Medicaid insurance card alongside important healthcare paperwork on a clean wooden desk. The hands are diverse skin tones suggesting a person of color. Beside the card are organized documents, a black pen, a pair of reading glasses, and a small potted succulent. Soft natural light from above creates gentle shadows. Mood is organized, professional, and reassuring. Tightly composed flat lay style with shallow depth of field." \
  "1344x896" \
  "$BLOG_DIR/medicaid-card-documents.png"

# ─── Inline 3: nurse-home-visit ──────────────────────────────────────────────
generate_image \
  "A compassionate Black female home healthcare nurse in her 40s wearing clean blue scrubs, providing professional and caring support to an elderly white woman in her 80s in the comfort of her own home. The nurse is gently checking the patient's blood pressure with a stethoscope, both seated on a comfortable living room couch. The patient has a warm, trusting smile. Family photos line the walls, and a soft afghan blanket is draped on the couch. Warm natural window light. Mood is dignified, caring, professional." \
  "1344x896" \
  "$BLOG_DIR/nurse-home-visit.png"

echo ""
echo "✅  All 4 Medicaid application blog images regenerated."
echo ""
