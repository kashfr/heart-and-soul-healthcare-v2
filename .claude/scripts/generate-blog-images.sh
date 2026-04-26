#!/bin/bash
# generate-blog-images.sh
# Usage: bash .claude/scripts/generate-blog-images.sh <path-to-mdx>
#
# Generates images for all PLACEHOLDER entries in a blog MDX file using
# OpenAI's gpt-image-2 model. Saves to public/images/blog/ and rewrites the
# MDX to remove PLACEHOLDER- prefixes.
#
# Required env var: OPENAI_API_KEY

set -euo pipefail

MDX_FILE="${1:?Usage: $0 <path-to-mdx-file>}"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PUBLIC_DIR="$PROJECT_DIR/public/images/blog"
QUALITY="${OPENAI_IMAGE_QUALITY:-medium}"

[ -z "${OPENAI_API_KEY:-}" ] && { echo "❌  OPENAI_API_KEY not set"; exit 1; }
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
      -d "$(jq -n --arg p "$prompt" --arg s "$size" --arg q "$QUALITY" \
           '{model: "gpt-image-2", prompt: $p, size: $s, quality: $q, n: 1}')" \
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
echo "    Model: gpt-image-2  |  Quality: $QUALITY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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

# ── Rewrite MDX: strip PLACEHOLDER- prefix from all image paths ───────────────
sed -i '' 's|/images/blog/PLACEHOLDER-|/images/blog/|g' "$MDX_FILE"

echo ""
echo "✅  Done. Images saved to public/images/blog/"
echo "✅  MDX updated — PLACEHOLDER- prefixes removed."
echo ""
