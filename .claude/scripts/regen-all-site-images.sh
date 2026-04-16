#!/bin/bash
# regen-all-site-images.sh
#
# Regenerates ALL legacy 1024x1024 site images at correct aspect ratios using FLUX.2 Max.
# Covers: carousel slides, homepage images, about page, and program page images.
#
# Aspect ratio assignments:
#   16:9 (1792×1024) — carousel hero slides, full-width hero-style images
#   3:2  (1344×896)  — section images (population, goal, inline content)
#
# Required env var: BFL_API_KEY

set -euo pipefail

PUBLIC_DIR="/Users/kfreeman/Projects/heart-and-soul-healthcare-v2/public/images"
[ -z "${BFL_API_KEY:-}" ] && { echo "❌  BFL_API_KEY not set"; exit 1; }

STYLE="Professional editorial photography, warm tones, natural lighting, hopeful and compassionate mood, diverse subjects"
HC_STYLE="$STYLE, healthcare setting"

# ── generate_image <prompt> <width> <height> <filename> ───────────────────────
generate_image() {
  local prompt="$1" width="$2" height="$3" filepath="$4"

  echo "  → $(basename "$filepath")  (${width}×${height})"

  local resp
  resp=$(curl -sf -X POST "https://api.bfl.ai/v1/flux-2-max" \
    -H "x-key: $BFL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$prompt" --argjson w "$width" --argjson h "$height" \
         '{prompt: $p, width: $w, height: $h}')")

  local polling_url
  polling_url=$(echo "$resp" | jq -r '.polling_url // empty')
  [ -z "$polling_url" ] && { echo "    ❌  Submission failed: $resp"; return 1; }

  local i status poll img_url
  for ((i=1; i<=45; i++)); do
    sleep 4
    poll=$(curl -sf "$polling_url" -H "x-key: $BFL_API_KEY")
    status=$(echo "$poll" | jq -r '.status // "unknown"')
    case "$status" in
      Ready)
        img_url=$(echo "$poll" | jq -r '.result.sample')
        curl -sf -o "$filepath" "$img_url"
        echo "    ✓  Saved"
        return 0 ;;
      Error|Failed|error|failed)
        echo "    ❌  Failed: $poll"; return 1 ;;
      *)
        [ $((i % 5)) -eq 0 ] && echo "    ⏳  Waiting... ($((i*4))s) [$status]" ;;
    esac
  done
  echo "    ❌  Timed out"; return 1
}

echo ""
echo "🖼   Regenerating ALL legacy site images with FLUX.2 Max"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ══════════════════════════════════════════════════════════════════════
#  CAROUSEL SLIDES — 16:9 (1792×1024) — these are the hero banners
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  Carousel Slides (16:9)"

generate_image \
  "A skilled pediatric nurse in scrubs gently caring for a young child in a bright, cozy home bedroom — the child is smiling and comfortable, medical equipment tastefully visible, warm natural window light, wide landscape composition. $HC_STYLE" \
  1792 1024 "$PUBLIC_DIR/gapp-slide-v2.png"

generate_image \
  "A young adult with an intellectual disability and a support worker planting flowers together in a sunny community garden — both laughing and engaged, colorful plants, golden hour sunlight, wide landscape composition. $HC_STYLE" \
  1792 1024 "$PUBLIC_DIR/now-comp-slide.png"

generate_image \
  "An adult with a physical disability in a wheelchair working confidently at a desk in a modern bright home office — natural window light, plants on the windowsill, a support worker visible in the background, empowered and independent feel, wide landscape composition. $HC_STYLE" \
  1792 1024 "$PUBLIC_DIR/icwp-slide-v3.png"

generate_image \
  "An elderly woman and a home health aide sitting together on a sunlit front porch, sharing conversation and laughter — warm afternoon light, rocking chairs, garden visible, comfortable and dignified atmosphere, wide landscape composition. $HC_STYLE" \
  1792 1024 "$PUBLIC_DIR/edwp-slide.png"

# ══════════════════════════════════════════════════════════════════════
#  HOMEPAGE IMAGES — 3:2 (1344×896) — content section images
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  Homepage Images (3:2)"

generate_image \
  "A compassionate female healthcare professional in scrubs kneeling beside an elderly patient in a warm living room, holding their hand while reviewing a care plan together — natural window light, family photos on the wall, comforting and professional atmosphere. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/caring-professional.png"

generate_image \
  "A diverse team of home healthcare professionals — nurses, caregivers, and a coordinator — standing together in a bright office lobby, smiling confidently, wearing scrubs and business casual, warm natural light, team unity and professionalism. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/care-team-v2.png"

# ══════════════════════════════════════════════════════════════════════
#  ABOUT PAGE — 3:2 (1344×896)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  About Page (3:2)"

generate_image \
  "The founding team of a home healthcare company in Georgia — two professionals seated in a warm, well-lit office reviewing patient care documents together, a Heart and Soul Healthcare-style logo visible on the wall, hopeful and mission-driven atmosphere, natural light. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/company-story.png"

# ══════════════════════════════════════════════════════════════════════
#  GAPP PROGRAM PAGE — 3:2 (1344×896)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  GAPP Program Page (3:2)"

generate_image \
  "A medically fragile child sleeping peacefully in their bedroom at home while a pediatric nurse in scrubs monitors nearby equipment — soft night light glow, stuffed animals on the bed, warm and safe atmosphere, gentle and protective mood. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/gapp-population.png"

generate_image \
  "A young child with medical needs playing happily on the floor of a bright living room with toys while a parent watches lovingly from the couch — a skilled nurse is visible in the background preparing medications, sunlight streaming through windows, joyful family scene. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/gapp-goal.png"

# ══════════════════════════════════════════════════════════════════════
#  NOW/COMP PROGRAM PAGE — 3:2 (1344×896)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  NOW/COMP Program Page (3:2)"

generate_image \
  "A young adult with an intellectual disability sitting at a table with a support coordinator, engaged in conversation about their care plan — community center setting, colorful posters on the wall, warm overhead lighting, inclusive and respectful atmosphere. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/now-comp-population.png"

generate_image \
  "A person with a developmental disability working at a local bakery counter, wearing an apron and smiling proudly while serving a customer — job coach visible nearby offering quiet support, warm bakery lighting, empowered and independent mood. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/now-comp-goal.png"

# ══════════════════════════════════════════════════════════════════════
#  ICWP PROGRAM PAGE — 3:2 (1344×896)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  ICWP Program Page (3:2)"

generate_image \
  "An adult man with a physical impairment using a motorized wheelchair, arriving at a physical therapy session with a personal support aide holding the door — modern accessible facility entrance, bright daylight, confident and determined expression. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/icwp-population-v2.png"

generate_image \
  "An adult woman with a traumatic brain injury sitting in her own kitchen, independently preparing a meal with adaptive utensils — a support worker watches nearby ready to assist, warm afternoon kitchen light, countertop with fresh vegetables, dignified independence. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/icwp-goal-v2.png"

# ══════════════════════════════════════════════════════════════════════
#  EDWP PROGRAM PAGE — 3:2 (1344×896)
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "📄  EDWP Program Page (3:2)"

generate_image \
  "An elderly African American man receiving blood pressure monitoring from a home health aide in the comfort of his own living room — warm lamp light, family photos on a side table, the patient seated in his favorite armchair, caring and dignified interaction. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/edwp-population.png"

generate_image \
  "An elderly woman tending to potted plants on her sunny apartment balcony, assisted by a caregiver who hands her a watering can — cityscape in the background, golden morning light, both smiling, maintaining independence and joy at home. $HC_STYLE" \
  1344 896 "$PUBLIC_DIR/edwp-goal.png"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  All 15 images regenerated!"
echo "   Carousel slides:  4 images at 1792×1024 (16:9)"
echo "   Content images:  11 images at 1344×896  (3:2)"
echo ""
