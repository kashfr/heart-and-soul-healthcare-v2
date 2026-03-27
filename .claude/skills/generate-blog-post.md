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
published: true
---
```

6. **File Naming**: Use kebab-case slug derived from the title. Example: `how-to-apply-for-gapp-georgia.mdx`

7. **Git Workflow**:
   - Create a new branch: `blog/<slug>`
   - Write the MDX file to `content/blog/<slug>.mdx`
   - Commit with message: `content: add blog post — "<title>"`
   - Push and open a PR with:
     - Title: `Blog: <post title>`
     - Body: Summary of the post, target keywords, and category

8. **Category Color Reference** (for context, not included in the file):
   - GAPP → teal
   - NOW/COMP → gold
   - ICWP → sage
   - EDWP → primary
   - Caregiver Resources → sage
   - Medicaid Guide → gold
   - Company News → teal
