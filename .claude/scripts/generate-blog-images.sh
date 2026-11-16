#!/bin/bash
# generate-blog-images.sh
# Usage: bash .claude/scripts/generate-blog-images.sh <path-to-mdx>
#
# Generates images for all PLACEHOLDER entries in a blog MDX file using
# OpenAI's newest gpt-image model, then saves to public/images/blog/ and rewrites
# the MDX to remove PLACEHOLDER- prefixes.
#
# Model selection (each run): asks the OpenAI API which models exist and picks
# the highest gpt-image version, preferring the "sunburst" (quality) tier over
# the plain and "flare" (speed) tiers. Dated snapshots and -mini are skipped.
# If the lookup fails, it falls back to FALLBACK_MODEL below and says so.
# OPENAI_IMAGE_MODEL pins a specific model and skips the lookup.
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

MDX_FILE="${1:?Usage: $0 <path-to-mdx-file>}"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PUBLIC_DIR="$PROJECT_DIR/public/images/blog"
QUALITY="${OPENAI_IMAGE_QUALITY:-medium}"
FALLBACK_MODEL="gpt-image-2.6-sunburst"

[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }

# ── latest_image_model ────────────────────────────────────────────────────────
# Prints the newest gpt-image model id the API lists, or nothing on failure.
# Ranks by [major, minor, tier] where tier is sunburst 3 > plain/unknown 2 >
# flare 1. Ids like gpt-image-2-2026-04-21 (snapshots) and -mini don't match.
latest_image_model() {
  curl -sf --max-time 20 https://api.openai.com/v1/models \
    -H "Authorization: Bearer $OPENAI_API_KEY" 2>/dev/null | jq -r '
      [ .data[].id as $id
        | ($id | capture("^gpt-image-(?<maj>[0-9]+)(?:\\.(?<min>[0-9]+))?(?:-(?<tier>[a-z]+))?$")?)
        | select(.tier != "mini")
        | { id: $id,
            rank: [ (.maj | tonumber),
                    ((.min // "0") | tonumber),
                    ({"sunburst": 3, "flare": 1}[.tier // ""] // 2) ] } ]
      | sort_by(.rank) | last | .id // empty' 2>/dev/null || true
}

if [ -n "${OPENAI_IMAGE_MODEL:-}" ]; then
  MODEL="$OPENAI_IMAGE_MODEL"
  MODEL_SOURCE="pinned by OPENAI_IMAGE_MODEL"
else
  MODEL="$(latest_image_model)"
  if [ -n "$MODEL" ]; then
    MODEL_SOURCE="latest available, auto-detected"
  else
    MODEL="$FALLBACK_MODEL"
    MODEL_SOURCE="FALLBACK: model lookup failed, could not confirm this is the latest"
  fi
fi
[ ! -f "$MDX_FILE" ] && { echo "❌  File not found: $MDX_FILE"; exit 1; }

mkdir -p "$PUBLIC_DIR"

# ── generate_image <prompt> <size> <output_path> ──────────────────────────────
# size is WIDTHxHEIGHT (e.g. "1792x1024"). Both must be multiples of 16.
generate_image() {
  local prompt="$1" size="$2" output="$3"
  local name
  name=$(basename "$output")

  # Append photorealism style cue to every prompt for consistent high quality output
  prompt="$prompt Photorealism, professional editorial photography, sharp focus, high detail."

  echo "  → $name  ($size)"

  local tmpfile attempt err
  tmpfile=$(mktemp)

  # Retry up to 3 times for transient API issues
  for attempt in 1 2 3; do
    curl -s -X POST "https://api.openai.com/v1/images/generations" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -H "Content-Type: application/json" \
      -d "$(jq -n --arg p "$prompt" --arg s "$size" --arg q "$QUALITY" --arg m "$MODEL" \
           '{model: $m, prompt: $p, size: $s, quality: $q, n: 1}')" \
      > "$tmpfile"

    err=$(jq -r '.error.message // empty' "$tmpfile" 2>/dev/null || echo "parse_error")
    [ -z "$err" ] && break
    [ "$attempt" = 3 ] && { echo "    ❌  Failed after 3 attempts: $err"; rm -f "$tmpfile"; return 1; }
    echo "    ⏳  Retry $attempt: $err"
    sleep 8
  done

  # Decode base64 and save as PNG
  jq -r '.data[0].b64_json // empty' "$tmpfile" | base64 -d > "$output"
  rm -f "$tmpfile"

  if [ ! -s "$output" ]; then
    echo "    ❌  Empty output file"
    return 1
  fi

  echo "    ✓  Saved"
}

echo ""
echo "🖼   Generating images for: $(basename "$MDX_FILE")"
echo "    Model: $MODEL ($MODEL_SOURCE)  |  Quality: $QUALITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── House rule: every post carries a hero + at least MIN_INLINE inline images ──
# Counts images already generated as well as pending PLACEHOLDERs, so re-running
# the script on a finished post does not trip the gate.
MIN_INLINE="${BLOG_MIN_INLINE_IMAGES:-3}"
inline_count=$(grep -c '^!\[.*\](/images/blog/' "$MDX_FILE" || true)
if [ "$inline_count" -lt "$MIN_INLINE" ]; then
  echo ""
  echo "❌  Only $inline_count inline image(s); every post needs at least $MIN_INLINE."
  echo "    Add more ![prompt-as-alt-text](/images/blog/PLACEHOLDER-<slug>-<keyword>.png)"
  echo "    at natural section breaks, then re-run. No images were generated."
  exit 1
fi
echo "    Inline images: $inline_count (minimum $MIN_INLINE) ✓"
echo ""

# ── Hero / featured image ─────────────────────────────────────────────────────
hero_line=$(grep 'featuredImage:.*PLACEHOLDER' "$MDX_FILE" || true)
if [ -n "$hero_line" ]; then
  hero_filename=$(echo "$hero_line" | sed 's|.*PLACEHOLDER-\([^"]*\)\.png.*|\1|')

  # Prefer heroImagePrompt frontmatter field; fall back to title + description
  hero_prompt=$(awk '/^heroImagePrompt:/{gsub(/^heroImagePrompt: *"|"[[:space:]]*$/,""); print; exit}' "$MDX_FILE")
  if [ -z "$hero_prompt" ]; then
    title=$(awk '/^title:/{gsub(/^title: *"|"[[:space:]]*$/,""); print; exit}' "$MDX_FILE")
    desc=$(awk '/^description:/{gsub(/^description: *"|"[[:space:]]*$/,""); print; exit}' "$MDX_FILE")
    hero_prompt="Professional editorial healthcare photography hero image. ${title}. ${desc} Diverse Georgia community, warm natural window light, hopeful and compassionate mood, wide landscape composition, professional photography, warm tones."
  fi

  generate_image "$hero_prompt" "1792x1024" "$PUBLIC_DIR/${hero_filename}.png"
fi

# ── Inline images ─────────────────────────────────────────────────────────────
while IFS= read -r line; do
  alt=$(echo "$line" | sed 's/!\[\(.*\)\](.*/\1/')
  filename=$(echo "$line" | sed 's|.*PLACEHOLDER-\([^)]*\)\.png.*|\1|')
  [ -z "$alt" ] || [ -z "$filename" ] && continue
  generate_image "$alt" "1344x896" "$PUBLIC_DIR/${filename}.png"
done < <(grep '!\[.*\](/images/blog/PLACEHOLDER-' "$MDX_FILE" || true)

# ── Verify every referenced image exists BEFORE rewriting the MDX ─────────────
# Without this, a silently-failed generation would still get its PLACEHOLDER-
# prefix stripped, producing a post that looks clean but renders broken <img>
# tags on the live blog index and post page.
missing=0
while IFS= read -r ref; do
  [ -z "$ref" ] && continue
  if [ ! -s "$PUBLIC_DIR/${ref}.png" ]; then
    echo "    ❌  Missing or empty: $PUBLIC_DIR/${ref}.png"
    missing=$((missing + 1))
  fi
done < <(grep -o '/images/blog/PLACEHOLDER-[^")]*\.png' "$MDX_FILE" \
         | sed 's|/images/blog/PLACEHOLDER-||; s|\.png$||' | sort -u)

if [ "$missing" -gt 0 ]; then
  echo ""
  echo "❌  $missing image(s) failed to generate. MDX left untouched —"
  echo "    PLACEHOLDER- prefixes kept so this post is not committed with broken images."
  echo "    Re-run this script after resolving the failure."
  exit 1
fi

# ── Rewrite MDX: strip PLACEHOLDER- prefix from all image paths ───────────────
sed -i '' 's|/images/blog/PLACEHOLDER-|/images/blog/|g' "$MDX_FILE"

echo ""
echo "✅  Done. Images saved to public/images/blog/"
echo "✅  All referenced images verified on disk."
echo "✅  MDX updated — PLACEHOLDER- prefixes removed."
echo ""
