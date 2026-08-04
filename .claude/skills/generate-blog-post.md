---
name: generate-blog-post
description: Generate an SEO-optimized healthcare blog post for the Heart and Soul Healthcare website. Creates a complete MDX file, commits to a new branch, and opens a PR for review.
user_invocable: true
---

# Generate Blog Post

Generate a new blog post for the Heart and Soul Healthcare website at `/content/blog/`.

## Instructions

1. **Topic Selection**: If the user provides a topic or keyword, use it. Otherwise, choose a topic relevant to Georgia home health care, Medicaid waiver programs (GAPP, NOW/COMP, ICWP, EDWP), caregiver resources, or navigating the healthcare system in Georgia.

2. **Research**: Search the web for current, accurate information about the chosen topic to ensure the post is factually correct and up-to-date. Focus on Georgia-specific information where applicable.

3. **Content Guidelines**:
   - Write in a warm, professional healthcare tone — empathetic but authoritative
   - Target 800–1200 words
   - Use clear headings (h2 and h3) to break up content
   - Include internal links to relevant program pages: `/programs/gapp`, `/programs/now-comp`, `/programs/icwp`, `/programs/edwp`
   - Include a `<ReferralCTA />` component at the end of the post
   - Use bulleted lists and blockquotes where appropriate for readability
   - Write for caregivers and family members who are searching for help — not for medical professionals

4. **SEO Optimization**:
   - Title: Include the primary keyword, keep under 60 characters if possible
   - Description: 150–160 characters, includes the primary keyword
   - Excerpt: 1–2 sentences that hook the reader
   - Tags: 4–6 relevant tags
   - Target long-tail keywords that caregivers search for (e.g., "how to apply for GAPP in Georgia", "caregiver burnout tips", "Medicaid waiver programs Georgia")

5. **Frontmatter Format**:
```yaml
---
title: "Post Title Here"
description: "Meta description for SEO"
date: "YYYY-MM-DD"
author: "Heart and Soul Healthcare"
category: "One of: GAPP, NOW/COMP, ICWP, EDWP, Caregiver Resources, Medicaid Guide, Company News"
tags: ["tag1", "tag2", "tag3"]
excerpt: "Short excerpt for blog cards"
featuredImage: "/images/blog/PLACEHOLDER-slug-hero.png"
published: true
---
```

6. **Image Placeholders** — write these as `PLACEHOLDER-` paths first, then generate the real images in step 7. Do NOT leave `PLACEHOLDER-` paths in a committed post; every referenced image must exist on disk before you commit.

   **Featured Image:**
   - Set `featuredImage` in frontmatter to `/images/blog/PLACEHOLDER-<slug>-hero.png`
   - Also add a `heroImagePrompt` frontmatter field with the full hero generation prompt (scene, subjects, mood, setting, lighting, "photorealism, professional editorial photography, warm tones, natural lighting, wide landscape composition, 16:9 aspect ratio")

   **Inline Images:**
   - Include **at least 3** inline placeholder images (hard minimum — the generation script refuses to run with fewer) distributed at natural visual breakpoints throughout the post. Add a 4th or 5th when the post is long or has more major sections that deserve a visual break.
   - Use this format: `![Detailed descriptive alt text that doubles as an image generation prompt](/images/blog/PLACEHOLDER-<slug>-<section-keyword>.png)`
   - The alt text IS the generation prompt — describe the scene, subjects, mood, setting, lighting, style, and aspect ratio (3:2 for inline). Always include the words "photorealism" and "professional editorial photography".
   - Place them after major section headings where a visual break enhances readability
   - Use descriptive filenames: e.g., `PLACEHOLDER-medicaid-guide-family-documents.png`

7. **Generate the images** — run the generation script:
   ```
   bash .claude/scripts/generate-blog-images.sh content/blog/<slug>.mdx
   ```
   This calls OpenAI `gpt-image-2` using `heroImagePrompt` for the hero (1792×1024) and each inline image's alt text (1344×896), saves to `public/images/blog/`, and strips the `PLACEHOLDER-` prefixes. It takes roughly 45–60 seconds per image. `OPENAI_API_KEY` is provided via `.claude/settings.local.json`.

   The script fails if any image is missing at the end. **If it fails, stop and report — do not commit a post with `PLACEHOLDER-` paths.** Missing images render as broken `<img>` tags on the live blog index and post page.

   Then review the generated images (Read each PNG) before committing — check for anatomical errors, garbled text, and respectful, authentic representation.

8. **File Naming**: Use kebab-case slug derived from the title. Example: `how-to-apply-for-gapp-georgia.mdx`

9. **Git Workflow**:
   - Create a new branch: `blog/<slug>` — start it from an up-to-date `main` (`git fetch origin && git checkout -b blog/<slug> origin/main`) so the post cannot get swept into an unrelated PR
   - Write the MDX file to `content/blog/<slug>.mdx`
   - Before staging, confirm the post is clean: `grep -c PLACEHOLDER content/blog/<slug>.mdx` must return 0
   - Stage the MDX **and** `public/images/blog/<slug>-*.png`
   - Commit with message: `content: add blog post with images — "<title>"`
   - Push and open a PR with:
     - Title: `Blog: <post title>`
     - Body must include:
       - Summary of the post, target keywords, and category
       - `## Images Generated` — the 4 filenames with their dimensions
       - A note that it was auto-generated and needs human review before merging
   - Verify the PR contains every expected file (`gh pr view <n> --json files`) before merging

10. **Category Color Reference** (for context, not included in the file):
   - GAPP → teal
   - NOW/COMP → gold
   - ICWP → sage
   - EDWP → primary
   - Caregiver Resources → sage
   - Medicaid Guide → gold
   - Company News → teal
