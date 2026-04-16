#!/bin/bash
# generate-blog-images.sh
# Usage: bash .claude/scripts/generate-blog-images.sh <path-to-mdx>
#
# Generates FLUX.2 Max images for all PLACEHOLDER entries in a blog MDX file.
# Saves images to public/images/blog/ and rewrites MDX to remove PLACEHOLDER- prefix.
#
# Required env var: BFL_API_KEY

set -euo pipefail

MDX_FILE="${1:?Usage: $0 <path-to-mdx-file>}"
PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PUBLIC_DIR="$PROJECT_DIR/public/images/blog"

[ -z "${BFL_API_KEY:-}" ] && { echo "❌  BFL_API_KEY not set"; exit 1; }
[ ! -f "$MDX_FILE" ] && { echo "❌  File not found: $MDX_FILE"; exit 1; }

mkdir -p "$PUBLIC_DIR"

# ── generate_image <prompt> <width> <height> <output_path> ────────────────────
generate_image() {
  local prompt="$1" width="$2" height="$3" output="$4"
  local name
  name=$(basename "$output")

  echo "  → $name  (${width}×${height})"

  # Submit generation request
  local resp
  resp=$(curl -sf -X POST "https://api.bfl.ai/v1/flux-2-max" \
    -H "x-key: $BFL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg p "$prompt" --argjson w "$width" --argjson h "$height" \
         '{prompt: $p, width: $w, height: $h}')")

  local polling_url
  polling_url=$(echo "$resp" | jq -r '.polling_url // empty')
  [ -z "$polling_url" ] && { echo "    ❌  Submission failed: $resp"; return 1; }

  # Poll until Ready (max ~3 min)
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
        echo "    ❌  Generation failed: $poll"; return 1 ;;
      *)
        [ $((i % 5)) -eq 0 ] && echo "    ⏳  Waiting... ($((i*4))s) [$status]" ;;
    esac
  done

  echo "    ❌  Timed out after 3 minutes"; return 1
}

echo ""
echo "🖼   Generating images for: $(basename "$MDX_FILE")"
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

  generate_image "$hero_prompt" 1792 1024 "$PUBLIC_DIR/${hero_filename}.png"
fi

# ── Inline images ─────────────────────────────────────────────────────────────
while IFS= read -r line; do
  alt=$(echo "$line" | sed 's/!\[\(.*\)\](.*/\1/')
  filename=$(echo "$line" | sed 's|.*PLACEHOLDER-\([^)]*\)\.png.*|\1|')
  [ -z "$alt" ] || [ -z "$filename" ] && continue
  generate_image "$alt" 1344 896 "$PUBLIC_DIR/${filename}.png"
done < <(grep '!\[.*\](/images/blog/PLACEHOLDER-' "$MDX_FILE" || true)

# ── Rewrite MDX: strip PLACEHOLDER- prefix from all image paths ───────────────
sed -i '' 's|/images/blog/PLACEHOLDER-|/images/blog/|g' "$MDX_FILE"

echo ""
echo "✅  Done. Images saved to public/images/blog/"
echo "✅  MDX updated — PLACEHOLDER- prefixes removed."
echo ""
