# Sosun Fihaara UI/UX Improvement Plan

Last reviewed: 2026-07-19

Evidence reviewed:

- Live site: <https://website-c3acf.web.app/>
- Desktop and 390 x 844 mobile layouts
- Homepage, catalogue, product detail, quote form, success state, and 404 state
- Astro layouts, navigation, styles, form endpoints, and public asset sizes

No analytics or user feedback were supplied. Statements marked **Assumption** should be validated with analytics or user research.

## Product and audience framing

The site presents Sosun Fihaara as an FMCG wholesale and retail distributor serving the Maldives.

Observed audiences:

- Island retailers and local shops
- Resorts, hotels, cafes, and commercial kitchens
- International FMCG brand principals
- Institutional buyers
- Households and retail customers

Likely primary journeys:

1. Identify the appropriate supply service.
2. Browse products or brands.
3. Inspect a product and pack size.
4. Request a wholesale quote or call sales.
5. Explore distribution capabilities and start a brand partnership conversation.

**Assumption:** A qualified B2B quote submission is the primary conversion. Calls, emails, and brand-partnership enquiries are secondary conversions. Product and brand views are intermediary conversions.

## Prioritized backlog

| Status | Priority | Finding | Recommended outcome | Impact | Effort |
| --- | --- | --- | --- | --- | --- |
| Done | Critical | Homepage does not load the shared design tokens. Live computed styles showed a 16px H1, transparent primary CTA, system fonts, and empty CSS variables. | Load the shared design system through the homepage layout and add desktop/mobile visual regression coverage. | Very high | Low |
| Done | Critical | Header text and logo wordmark have insufficient contrast over dark heroes. | Add an explicit dark-hero header theme and switch to the light header theme after scrolling. | Very high | Low-Medium |
| Done | Critical | Server-side quote/contact errors return raw JSON and can discard user input. | Preserve values, show an error summary plus field errors, focus the summary, and retain a phone fallback. | Very high | Medium |
| Done | Critical | The Insights dropdown is hover-driven and the mobile drawer lacks complete focus management. | Support click, Enter, Space, Escape, accurate `aria-expanded`, focus containment, focus return, and an inert background. | High | Medium |
| Done | Critical | Skip navigation exists only on the homepage. | Put a skip link and focusable content target in both shared public layouts. | High | Low |
| Done | High | The 548-product catalogue has no text search and includes duplicate category labels. | Add server-backed search across name, brand, item code, category, and keywords; canonicalize categories. | High | Medium |
| Done | High | Product-specific wholesale CTAs route to the general contact form and lose product context. | Route to the quote form and prefill product, item code, and brand. | High | Low-Medium |
| Done | High | Price values do not clearly state whether they are per unit, pack, or case. | Display an explicit price basis or label pricing as indicative/current-on-request. | High | Medium |
| Done | High | The desktop quote page has a very large heading and a narrow, visually unbalanced form area. | Use a centered responsive desktop shell with clear procurement and contact sections. | Medium-High | Low |
| Done | High | Mobile navigation controls are smaller than the recommended 44 x 44px target. | Increase target sizes while preserving the current compact header. | High | Low |
| Planned | Medium | Sora/Manrope and Alumni Sans SC/Lato rules compete, while the homepage currently falls back to system fonts. | Document one primary type system and constrain editorial exceptions. | Medium | Medium |
| Planned | Medium | Hero copy gives B2B and household audiences similar weight despite a wholesale-primary CTA. | State the wholesale distribution proposition first and position retail as a secondary route. | Medium | Low |
| Done | Medium | Empty, pending, success, and recovery states are incomplete; the live 404 is a raw framework page. | Add clear-filter actions, submitting feedback, announced success, and a branded 404 page. | Medium | Low-Medium |
| Planned | Medium | Homepage PNGs are roughly 849-943KB each; 54 font files are hosted and animation libraries add script cost. | Generate responsive AVIF/WebP images, subset fonts, and load animation code only where it adds measurable value. | Medium-High | Medium |
| Planned | Medium | Statistics, exclusivity claims, and testimonials lack visible supporting detail. | Link claims to relevant evidence and add approved partner attribution where available. | Medium | Medium |
| Done | Low | Labels such as "Explore More" and "Load More" are generic or describe a different interaction. | Use "View product" with a product-specific accessible name and "Show 24 more products" or pagination. | Low-Medium | Low |

## Concrete copy and interaction examples

- General acquisition CTA: **Request a Wholesale Quote**
- Product CTA: **Request a Quote for This Product**
- Catalogue search: **Search products, brands, or item codes**
- Empty results: **No products match “almond milk”. Clear filters or request sourcing help.**
- Submission state: **Submitting quote request...**
- Error summary: **We couldn't submit your request. Check the highlighted fields or call +960 331 3020.**
- Success state: **Request received. Our trade desk will respond within one business day.**

## Completed quick wins

1. Restore shared design tokens on the homepage.
2. Apply a high-contrast header theme over dark heroes.
3. Route wholesale CTAs to the quote form with product context.
4. Add shared skip navigation and 44 x 44px mobile navigation targets.
5. Deduplicate catalogue categories and add product search.

## Delivery roadmap

### Immediate: 0-3 days

- Restore homepage design tokens and intended typography.
- Correct header contrast on dark backgrounds.
- Correct wholesale CTA destinations and prefill product context.
- Add shared skip navigation and minimum tap-target sizing.
- Complete keyboard behavior for the Insights menu and mobile drawer.
- Add a branded 404 page.
- Verify at 390px, 768px, 1024px, and large desktop widths.

### Short term: 1-3 weeks

- Implement catalogue search, canonical categories, active filter chips, and improved empty states.
- Keep entered information through form validation and server failures.
- Refine the quote-page layout and price-unit language.
- Optimize homepage images and reduce unnecessary font/script loading.
- Consolidate the typography rules.

### Longer term: 1-2 months

- Consolidate color, typography, spacing, button, card, and form rules into a documented design system.
- Validate navigation labels and audience messaging with retailer, hospitality, and brand-partner users.
- Instrument the conversion funnel and run focused tests on the hero and product-to-quote journey.

Recommended metrics:

- Homepage primary and secondary CTA click-through
- Catalogue searches, filter usage, and zero-result rate
- Product-detail to quote-form click-through
- Quote starts, validation failures, server failures, and successful submissions
- Mobile versus desktop completion rate
- LCP, INP, and CLS by device class

## Current implementation handover

### Completed in the current working tree

- Restored homepage design tokens, typography, CTA styling, and responsive heading sizes.
- Corrected header and logo contrast over dark heroes and light pages.
- Added shared skip navigation and a focusable main-content target.
- Completed keyboard and focus behavior for the desktop Insights menu and mobile navigation dialog.
- Increased mobile navigation controls to at least 44 x 44px.
- Routed wholesale product CTAs to `/request-quote` with product, code, and brand prefill.
- Added a branded, actionable 404 page.
- Added progressively enhanced quote and contact submissions with:
  - preserved entered values;
  - pending button feedback;
  - focused accessible error summaries;
  - linked field-level errors;
  - structured API validation responses; and
  - a telephone fallback.
- Added server-rendered catalogue search across product name, brand, item code, category, subcategory, and keywords.
- Rebuilt catalogue categories from active product inventory while using CMS records for canonical labels and order. This:
  - collapses duplicate normalized labels such as the duplicate Dairy records;
  - excludes configured categories with no active products; and
  - restores active product categories missing from the CMS category list, including Baking, Baby Care, and Chocolate.
- Added category and subcategory counts, removable active-filter chips, query-preserving pagination, actionable zero-result recovery, and mobile-first result ordering.
- Replaced generic catalogue actions with product-specific accessible names and exact "Show N more products" pagination labels.
- Added a typed product price-basis model supporting per-case, per-pack, per-unit, and indicative pricing. Legacy multipack records default safely to per-case display, records without a pack configuration remain indicative, and blank amounts display as current price on request.
- Added admin price-basis selection and server-side validation, and aligned price validation with existing comma-formatted catalogue amounts such as `3,420` and `1,231.49`.
- Applied consistent price and pack-configuration language across the homepage, catalogue, brand pages, product detail pages, and admin product list.
- Rebuilt the quote page as a centered responsive desktop layout with:
  - an anchored procurement and trust panel;
  - clear procurement and contact-detail sections;
  - process, response-time, nationwide-distribution, and telephone reassurance;
  - improved desktop proportions and reduced unused space; and
  - a shortened mobile introduction so the form begins materially earlier.

### Verification status

- `npm run check`: passed with 0 errors.
- `npm test`: 59 of 59 tests passed.
- Desktop and 390 x 844 local browser checks passed.
- Quote/contact error focus, value retention, telephone fallback, and mobile behavior verified.
- Catalogue search by item code, active-filter removal, query-preserving pagination, canonical category output, and zero-result recovery verified.
- Product price basis, legacy fallback behavior, admin validation, product prefill, quote success state, desktop centering, and the 390 x 844 mobile collapse were verified.
- No browser console errors were observed during the latest catalogue and quote-page checks.
- Two unrelated existing TypeScript hints remain in `src/layouts/AdminLayout.astro` and `src/lib/csrf.ts`.

### Workspace state

- All UI/UX changes are unstaged and uncommitted.
- The worktree was clean before this implementation series, so the current changes belong to this work.
- The local Astro server at `http://localhost:4322/` may still be running.
- New focused tests are in `tests/unit/contact-form.test.ts`, `tests/unit/catalog.test.ts`, and `tests/unit/product-pricing.test.ts`.

### Recommended next batch

1. Optimize large homepage images to responsive AVIF/WebP and reduce unnecessary font/script loading.
2. Consolidate the typography rules and strengthen wholesale-first homepage messaging.
3. Add evidence or approved attribution for statistics, exclusivity claims, and testimonials.
4. Instrument the catalogue-to-quote conversion funnel and validate the new price-basis language with sales staff.

## Accessibility and quality baseline

Preserve the positive patterns already present: semantic headings, native form controls, visible labels, descriptive image alternatives, telephone links, and reduced-motion handling.

Release checks for public UI changes:

- Keyboard-only navigation and visible focus
- Screen-reader names, roles, states, and error announcements
- WCAG AA text and control contrast
- 44 x 44px touch targets where controls are adjacent or frequently used
- Responsive checks at the supported breakpoints
- Empty, loading/pending, success, validation, server-error, and 404 states
- `npm run check`

## Work log

- 2026-07-19: Live/code audit completed and backlog created.
- 2026-07-19: Immediate remediation batch completed: homepage tokens, header contrast, shared skip link, menu keyboard/focus behavior, 44px mobile controls, product-to-quote prefill, and branded 404.
- 2026-07-19: Verified with `npm run check` (0 errors), 48 unit tests, and local desktop/mobile browser checks.
- 2026-07-19: Added progressively enhanced quote/contact submissions with pending feedback, value preservation, a focused accessible error summary, linked field errors, and a phone fallback.
- 2026-07-19: Verified form recovery with `npm run check` (0 errors), 51 unit tests, and desktop plus 390 x 844 browser interaction checks.
- 2026-07-19: Added server-rendered multi-field catalogue search, product-derived canonical categories and counts, removable active-filter chips, query-preserving pagination, and actionable zero-result recovery.
- 2026-07-19: Verified catalogue improvements with `npm run check` (0 errors), 54 unit tests, desktop and 390 x 844 browser checks, code search, zero-result recovery, and no browser console errors.
- 2026-07-19: Added explicit case, pack, unit, indicative, and current-on-request price presentation across public and admin product surfaces, including migration-safe legacy fallbacks and comma-formatted price validation.
- 2026-07-19: Rebuilt the quote page into a centered two-column desktop experience with stronger hierarchy, trust cues, clear form sections, and a compact mobile introduction.
- 2026-07-19: Verified the latest work with `npm run check` (0 errors), 59 unit tests, desktop and 390 x 844 browser checks, product-context prefill, success state, responsive overflow checks, and no browser console errors.
