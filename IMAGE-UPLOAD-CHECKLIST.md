# Sosun Fihaara — Image Upload Checklist (Pre-Launch)

Complete every item here before deploying to production.
All uploads happen in **Wix Dashboard → Content Manager** unless noted otherwise.

---

## Priority 1 — SiteContent collection (1 row, multiple fields)

These control every page hero and global section image.
Open **Content Manager → SiteContent → your single row → Edit**.

| # | CMS Field | Where it appears | Recommended size | Status |
|---|-----------|-----------------|-----------------|--------|
| 1 | `homeHeroImage` | Home page — full-width hero banner | 1440 × 600 px | `[ ]` |
| 2 | `homeIntroImage` | Home page — "Who we are" split section (left image) | 800 × 600 px | `[ ]` |
| 3 | `partnerImage` | Home page — partner/delivery split section (right image) | 800 × 600 px | `[ ]` |
| 4 | `newsPageHero` | News page — hero banner at top | 1440 × 500 px | `[ ]` |

> **Note:** `aboutPageHero`, `productsPageHero`, `brandsPageHero`, `recipesPageHero`,
> `contactPageHero` are defined in the CMS schema but the current templates use
> `/logo.png` directly (see Priority 3 below). Add these fields to SiteContent
> and wire them up, or use the static-asset method in Priority 3.

---

## Priority 2 — Brands collection (21 brands)

Each brand needs a `logo` uploaded.
Open **Content Manager → Brands → click each brand row → upload logo image**.

| # | Brand | Logo uploaded? |
|---|-------|----------------|
| 1 | (your brand 1) | `[ ]` |
| 2 | (your brand 2) | `[ ]` |
| 3 | (your brand 3) | `[ ]` |
| … | (repeat for all 21 brands) | `[ ]` |

**Logo specs:** PNG with transparent background · 300 × 150 px minimum · optimised ≤ 100 KB  
Wix will auto-serve via CDN.

---

## Priority 3 — Hardcoded `/logo.png` placeholders in page templates

These are static placeholders in code — not CMS-driven yet.
Two options: **(A) upload as static assets** or **(B) wire to CMS**.

Option A is faster pre-launch. Option B is better long-term.

### About page (`src/pages/about.astro`)

| # | Line | Description | Action |
|---|------|-------------|--------|
| 5 | 9 | Page hero banner | Upload `public/about-hero.jpg` and update `src="/about-hero.jpg"` |
| 6 | 20 | "Who we are" split image (well-stocked retail store) | Upload `public/about-intro.jpg` and update src |
| 7 | 89 | "Quality inspection" split image | Upload `public/about-quality.jpg` and update src |

### Brands page (`src/pages/brands.astro`)

| # | Line | Description | Action |
|---|------|-------------|--------|
| 8 | 28 | Page hero banner | Upload `public/brands-hero.jpg` and update src |

### Recipes page (`src/pages/recipes.astro`)

| # | Line | Description | Action |
|---|------|-------------|--------|
| 9 | 9 | Page hero banner | Upload `public/recipes-hero.jpg` and update src |
| 10 | 30 | Featured recipe hero — chocolate cake pops | Upload `public/recipe-cake-pops.jpg` |
| 11 | 55 | Recipe card — chicken biryani | Upload `public/recipe-biryani.jpg` |
| 12 | 64 | Recipe card — rice vermicelli stir fry | Upload `public/recipe-vermicelli.jpg` |
| 13 | 73 | Recipe card — vanilla pudding parfait | Upload `public/recipe-pudding.jpg` |
| 14 | 82 | Recipe card — coconut milk fish curry | Upload `public/recipe-fish-curry.jpg` |
| 15 | 91 | Recipe card — chicken mayo sandwich | Upload `public/recipe-sandwich.jpg` |
| 16 | 100 | Recipe card — butter cookies | Upload `public/recipe-cookies.jpg` |

### Home page testimonials (`src/pages/index.astro`)

| # | Line | Description | Action |
|---|------|-------------|--------|
| 17 | 134 | Testimonial avatar — Ibrahim Naseer | Upload `public/testimonial-ibrahim.jpg` |
| 18 | 142 | Testimonial avatar — Aishath Reema | Upload `public/testimonial-aishath.jpg` |
| 19 | 150 | Testimonial avatar — Hassan Waheed | Upload `public/testimonial-hassan.jpg` |

**Avatar specs:** 80 × 80 px · square crop · JPG · ≤ 20 KB

---

## Priority 4 — Products collection (548 products)

Each product needs an `image` uploaded. This is the most time-consuming task.

Open **Content Manager → Products → click each row → upload image**.

**Product image specs:** 400 × 400 px · square crop · white/transparent background · JPG or PNG

**Bulk tip:** You can import images via the Wix CSV importer if you have a public image URL
for each product (e.g. hosted on Dropbox/Drive). Add a column `image` with the URL and re-import.

| Batch | Status |
|-------|--------|
| Brands A–C (approx. 100–150 products) | `[ ]` |
| Brands D–M (approx. 150–200 products) | `[ ]` |
| Brands N–Z (approx. 150–200 products) | `[ ]` |

---

## Priority 5 — Categories collection

Each category card on the home page needs an `image`.
Open **Content Manager → Categories → click each row → upload image**.

| # | Category | Image uploaded? |
|---|----------|----------------|
| 1 | Baby Care | `[ ]` |
| 2 | Baking | `[ ]` |
| 3 | Beverages | `[ ]` |
| 4 | Chocolate | `[ ]` |
| 5 | Confectionery | `[ ]` |
| 6 | Cooking Ingredients | `[ ]` |
| 7 | Dairy | `[ ]` |
| 8 | Mosquito Repellent | `[ ]` |
| 9 | Recipe's & Spices | `[ ]` |
| 10 | Sauces & Dressings | `[ ]` |
| 11 | Snacks | `[ ]` |
| 12 | Spreads & Mayo | `[ ]` |
| 13 | Staple Foods | `[ ]` |

**Category image specs:** 600 × 400 px · landscape · vibrant, product-forward photography

---

## Image format quick reference

| Use | Format | Size |
|-----|--------|------|
| Page heroes | JPG, quality 85% | 1440 × 500–600 px |
| Section splits | JPG, quality 85% | 800 × 600 px |
| Product photos | JPG or PNG | 400 × 400 px, square |
| Brand logos | PNG with transparency | 300 × 150 px |
| Category cards | JPG, quality 85% | 600 × 400 px |
| Testimonial avatars | JPG | 80 × 80 px |

Wix automatically compresses and serves all images via CDN — you don't need to pre-optimise aggressively, but keep originals ≤ 2 MB per file for fast uploads.

---

## Minimum viable launch

If you're time-constrained, complete **Priority 1 + Priority 2** before launch.
The hero images (P1) and brand logos (P2) are the most user-visible gaps.
Product images (P4) can be filled in incrementally post-launch.

*Last updated: 2026-06-28*
