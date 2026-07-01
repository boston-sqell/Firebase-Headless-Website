# Sosun Fihaara — Engineering Audit Fix Tracker

Audit date: 2026-06-28  
Fixes applied: 2026-06-28, 2026-06-30 (second pass)  
Overall score at audit: **41/100**

---

## How to read this file

Statuses: `[ ]` pending · `[x]` done · `[~]` in progress · `[!]` blocked / requires manual action

---

## PHASE 1 — Immediate (all complete ✅)

| # | Finding | Description | Status |
|---|---------|-------------|--------|
| 1 | SEC-001 | Removed hardcoded `WIX_CLIENT_SECRET` from `cms.ts` + `fetch-cms.mjs` | `[x]` |
| 2 | BUG-001 | Fixed pagination slice — was always returning from index 0 | `[x]` |
| 3 | SEC-002 | Fixed CSRF origin check — AND logic → OR logic in `contact.ts` | `[x]` |
| 4 | BUG-002 | Fixed `brands.sort()` cache mutation → `[...brands].sort()` | `[x]` |
| 5 | BUG-007 | Fixed protocol-relative URLs `//contact` → `/contact` in two files | `[x]` |
| 6 | SEC-005 | Added server-side input validation + sanitisation to `contact.ts` | `[x]` |
| 7 | QUAL-005 | Deleted dev artifacts from root (extract.py, replace.py, temp.html, etc.) | `[x]` |
| 8 | QUAL-003 | Deleted `Welcome.astro` (unused Astro boilerplate) | `[x]` |
| 9 | QUAL-004 | Deleted `hero-animation.ts` (referenced non-existent DOM classes) | `[x]` |
| 10 | BUG-005 | Deleted broken `test-cms.ts` (fundamentally un-runnable mock) | `[x]` |
| 11 | — | Created `.env.example` documenting all required env vars | `[x]` |
| 12 | QUAL-009 | Fixed hardcoded year in `Footer.astro` → `new Date().getFullYear()` | `[x]` |

---

## PHASE 2 — Short-term (all complete ✅)

| # | Finding | Description | Status |
|---|---------|-------------|--------|
| 13 | SEC-007 | Fixed CORS in `cms.json.ts` — only sets header for allowed origins | `[x]` |
| 14 | BUG-004 | Added 3× exponential backoff retry to `getToken()` + `query()` | `[x]` |
| 15 | REL-005 | Added `AbortController` 10s timeout to all `fetch()` calls | `[x]` |
| 16 | SEC-008/010 | Created `src/middleware.ts` — CSP, HSTS, X-Frame-Options, Referrer-Policy | `[x]` |
| 17 | REL-004 | Created `/api/health` endpoint | `[x]` |
| 18 | PERF-002 | Removed `gsap` from `package.json` — Motion One only | `[x]` |
| 19 | REL-002 | Added error state banners to index, products, brands pages | `[x]` |
| 20 | PERF-004 | Verified `font-display: swap` on all 54 `@font-face` blocks | `[x]` |

---

## PHASE 3 — Medium-term (4 of 8 complete)

| # | Finding | Description | Status |
|---|---------|-------------|--------|
| 21 | QUAL-001 | Renamed single-letter product keys `n/b/c/pr/p/bs/kw` → full names | `[x]` |
| 22 | QUAL-002 | Replaced `any` types with `Product`/`Brand`/`Category` interfaces | `[x]` |
| 23 | PERF-003 | Added `width`/`height` + `aspect-ratio` to product/brand images | `[x]` |
| 24 | BUG-003 | Added product code uniqueness guard with console warning | `[x]` |
| 25 | DATA-001 | Per-request caching via `Astro.locals` (remove module-level shared cache) | `[ ]` |
| 26 | DATA-002 | Cache invalidation mechanism (webhook or `?refresh` param) | `[ ]` |
| 27 | REL-003 | Structured JSON logging with request correlation IDs | `[ ]` |
| 28 | — | Integrate News CMS collection — remove static hardcoded news content | `[ ]` |

---

## PRE-LAUNCH — Blocking items (all code complete ✅, manual steps remain)

| # | Item | Code status | Manual action required |
|---|------|-------------|----------------------|
| 29 | #33 Custom domain | `[x]` Origins now read from `PUBLIC_SITE_URL` env var | Set `PUBLIC_SITE_URL=https://sosunfihaara.com` in `.env.local` then configure DNS in Wix Dashboard |
| 30 | #35 CSS audit | `[x]` `global.css` reduced from **1,365 KB → 57 KB** (24× smaller). Fonts extracted to `public/fonts/` (54 woff2 files) | None — done |
| 31 | #37 CMS images | `[x]` `IMAGE-UPLOAD-CHECKLIST.md` created with every image slot documented | Upload images per checklist (Priorities 1 + 2 minimum before launch) |

---

## ⚠️ ROTATE YOUR WIX CREDENTIALS BEFORE DEPLOYING

The `WIX_CLIENT_SECRET` that was hardcoded in source has been **removed from code** but is still in git history. You must rotate it:

1. Wix Dashboard → Settings → Advanced Settings → API Keys
2. Revoke the old secret, generate a new one
3. Update `.env.local`: `WIX_CLIENT_SECRET=<new-value>`
4. Also set `PUBLIC_SITE_URL=https://sosunfihaara.com` in `.env.local`
5. Redeploy

---

## PHASE 3b — Second pass (2026-06-30)

| # | Finding | Description | Status |
|---|---------|-------------|--------|
| 38 | BUG-HTML-001 | Removed unused Google Fonts `<link>` + 2 `<preconnect>` from `Layout.astro` — fonts were never used (CSS vars use Sora/CG/Manrope self-hosted) and were blocked by `font-src 'self'` CSP anyway | `[x]` |
| 39 | BUG-HTML-002 | Fixed double-nested `<main>` — `Layout.astro` wrapped `<slot />` in `<main>` while 6 pages also have their own `<main>`, producing `<main><main>` invalid HTML. Removed wrapper from Layout, added `<main>` to `about.astro` | `[x]` |
| 40 | BUG-HTML-003 | Fixed `about.astro` missing closing tags — `</div>`, `</main>`, `</Layout>` were absent at end of file (lost during heavy editing) | `[x]` |

---

## PHASE 4 — Post-launch

| # | Finding | Description | Status |
|---|---------|-------------|--------|
| 32 | REL-001 | Unit tests for `cms.ts` functions | `[ ]` |
| 33 | REL-001 | Integration tests for API routes | `[ ]` |
| 34 | REL-001 | E2E smoke tests with Playwright | `[ ]` |
| 35 | — | CI/CD pipeline (GitHub Actions → `npx @wix/cli release`) | `[ ]` |
| 36 | — | Wix monitoring / error tracking | `[ ]` |
| 37 | — | Add `rel="noopener noreferrer"` to all external links | `[ ]` |

---

## Files changed across all sessions

| File | Change |
|------|--------|
| `src/lib/cms.ts` | Removed hardcoded secret · `fetchWithRetry` (3× backoff + 10s timeout) · descriptive product keys |
| `src/lib/origins.ts` | **New** — shared `ALLOWED_ORIGINS` + `isAllowedOrigin()` driven by `PUBLIC_SITE_URL` env var |
| `fetch-cms.mjs` | Removed hardcoded secret — reads `WIX_CLIENT_SECRET` from env |
| `src/pages/products.astro` | Fixed pagination · error state · descriptive keys · Product types · image hints |
| `src/pages/brands.astro` | Fixed array mutation · error state · Brand types |
| `src/pages/products/[code].astro` | Fixed `//contact` URL · descriptive keys · Product type · uniqueness guard · image hints |
| `src/pages/brands/[slug].astro` | Descriptive keys · Product/Brand types · image hints |
| `src/pages/api/contact.ts` | Fixed origin check · input validation + sanitisation · uses `origins.ts` |
| `src/pages/api/cms.json.ts` | Fixed CORS · uses `origins.ts` |
| `src/pages/api/health.ts` | **New** — `/api/health` endpoint |
| `src/middleware.ts` | **New** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| `src/components/Footer.astro` | Dynamic copyright year |
| `src/styles/global.css` | **1,365 KB → 57 KB** — extracted all base64 fonts to `public/fonts/` |
| `public/fonts/` | **New** — 54 × woff2 font files (Cormorant Garamond, Manrope, Sora) |
| `.env.example` | Documents `WIX_CLIENT_ID`, `WIX_CLIENT_SECRET`, `PUBLIC_SITE_URL`, `WIX_STAGING_URL` |
| `package.json` | Removed `gsap` dependency |
| `IMAGE-U