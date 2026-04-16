#!/bin/bash
# regen-existing-images.sh
#
# Regenerates all legacy blog images at the correct aspect ratios:
#   Hero images  → 1792×1024 (16:9)
#   Inline images → 1344×896  (3:2)
#
# Overwrites existing files in public/images/blog/.
# Does NOT modify any MDX files (paths are already correct).
#
# Required env var: BFL_API_KEY

set -euo pipefail

PUBLIC_DIR="/Users/kfreeman/Projects/heart-and-soul-healthcare-v2/public/images/blog"
[ -z "${BFL_API_KEY:-}" ] && { echo "❌  BFL_API_KEY not set"; exit 1; }

# ── generate_image <prompt> <width> <height> <filename> ───────────────────────
generate_image() {
  local prompt="$1" width="$2" height="$3" filename="$4"
  local output="$PUBLIC_DIR/$filename"

  echo "  → $filename  (${width}×${height})"

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
        curl -sf -o "$output" "$img_url"
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

STYLE="Professional editorial photography, warm tones, natural lighting, hopeful and compassionate mood, diverse Georgia community"

echo ""
echo "🖼   Regenerating legacy blog images at correct aspect ratios"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── how-to-apply-for-medicaid-in-georgia ──────────────────────────────────────
echo ""
echo "📄  How to Apply for Medicaid in Georgia"

generate_image \
  "A warm and welcoming scene of a diverse Georgia family sitting together at a kitchen table, reviewing Medicaid application paperwork with hopeful expressions, natural window light, wide landscape composition. $STYLE, 16:9 aspect ratio" \
  1792 1024 "medicaid-application-hero.png"

generate_image \
  "A family reviews important medical and insurance documents together in their living room, papers spread on a coffee table, warm lamp light, attentive and supportive expressions. $STYLE, 3:2 aspect ratio" \
  1344 896 "family-reviewing-documents.png"

generate_image \
  "Close-up of hands holding a Medicaid insurance card alongside important healthcare documents and a pen on a wooden table, warm natural light. $STYLE, 3:2 aspect ratio" \
  1344 896 "medicaid-card-documents.png"

generate_image \
  "A home healthcare nurse in scrubs provides compassionate care during a home visit, sitting beside a patient in a comfortable home setting, warm natural light through windows. $STYLE, 3:2 aspect ratio" \
  1344 896 "nurse-home-visit.png"

# ── navigating-medicaid-waivers-georgia ───────────────────────────────────────
echo ""
echo "📄  Navigating Georgia's Medicaid Waiver Programs"

generate_image \
  "A diverse group of Georgia community members representing different waiver program beneficiaries — a child, a young adult with a disability, an elderly person — together in a bright welcoming community space, wide landscape composition. $STYLE, 16:9 aspect ratio" \
  1792 1024 "medicaid-waivers-hero.png"

generate_image \
  "A young man in a wheelchair working confidently on a laptop in his own bright home, independent and engaged, bookshelves and plants in background, natural window light. $STYLE, 3:2 aspect ratio" \
  1344 896 "wheelchair-independence.png"

generate_image \
  "A home health aide checking blood pressure for an elderly woman in the comfort of her own home, both smiling, warm afternoon light, cozy home setting. $STYLE, 3:2 aspect ratio" \
  1344 896 "elderly-home-care.png"

generate_image \
  "A couple sitting at their kitchen table reviewing Medicaid eligibility documents and a checklist together, one pointing at the paperwork, warm natural light, focused and hopeful. $STYLE, 3:2 aspect ratio" \
  1344 896 "family-medicaid-checklist.png"

# ── understanding-gapp-program-georgia ────────────────────────────────────────
echo ""
echo "📄  Understanding the GAPP Program"

generate_image \
  "A skilled pediatric nurse in scrubs tending to a medically fragile child at home, warm cozy bedroom setting with soft lighting, medical equipment tastefully present, compassionate care, wide landscape composition. $STYLE, 16:9 aspect ratio" \
  1792 1024 "gapp-program-hero.png"

generate_image \
  "A skilled pediatric nurse carefully monitoring medical equipment beside a sleeping child in a warm cozy home bedroom, soft bedside lamp light, gentle and professional. $STYLE, 3:2 aspect ratio" \
  1344 896 "gapp-nurse-medical-care.png"

generate_image \
  "A mother reviewing care plan paperwork with a healthcare coordinator at a dining table while her child plays happily in the background, warm natural light, collaborative and reassuring. $STYLE, 3:2 aspect ratio" \
  1344 896 "gapp-family-support.png"

generate_image \
  "A caring nurse reading a bedtime story to a young child in a cozy home-like bedroom setting, medical monitoring equipment softly visible nearby, warm lamp light, nurturing atmosphere. $STYLE, 3:2 aspect ratio" \
  1344 896 "gapp-child-home-care.png"

# ── caregiver-self-care-tips ──────────────────────────────────────────────────
echo ""
echo "📄  Caregiver Self-Care: 7 Practical Tips"

generate_image \
  "A caregiver taking a peaceful moment of self-care — sitting quietly with a cup of tea by a sunny window, looking rested and calm, soft warm morning light, wide landscape composition. $STYLE, 16:9 aspect ratio" \
  1792 1024 "caregiver-selfcare-hero.png"

generate_image \
  "A respite nurse in scrubs arriving at a family caregiver's welcoming front door, bringing relief and professional support, caregiver greeting her with grateful expression, warm afternoon light. $STYLE, 3:2 aspect ratio" \
  1344 896 "caregiver-respite-nurse.png"

generate_image \
  "A diverse caregiver support group of men and women sharing stories and encouragement in a warm community center setting, seated in a circle, natural light, open and supportive atmosphere. $STYLE, 3:2 aspect ratio" \
  1344 896 "caregiver-support-group.png"

generate_image \
  "A daughter and her elderly mother enjoying a peaceful morning walk together in a leafy neighborhood, arms linked, smiling at each other, soft morning sunlight filtering through trees. $STYLE, 3:2 aspect ratio" \
  1344 896 "caregiver-walking-together.png"

echo ""
echo "✅  All 16 images regenerated at correct aspect ratios."
echo "   Hero images: 1792×1024 (16:9)"
echo "   Inline images: 1344×896 (3:2)"
echo ""
