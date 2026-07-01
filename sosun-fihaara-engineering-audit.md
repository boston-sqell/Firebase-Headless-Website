
# Engineering Audit Report — Sosun Fihaara (sosun-fihaara-firebase)

**Scope:** Full architecture, deployment, debugging, performance, security, and code-quality review
**Repository:** `C:\Dev\sosun-fihaara-firebase`
**Audit date:** 2026-07-01
**Method:** Static review of the working tree, `.git` history, `package-lock.json` (via `npm audit`), and deployment scripts. No live GCP project, Cloud Run revision, Firebase Console, or running instance was accessible during this review — all findings below are grounded in what exists in the repository, and every place where live-environment data would be needed is called out explicitly rather than assumed.

---

## 0. Correction of scope before the audit begins

The request asked for an audit of "a headless web application built using Google AI technologies, Firebase, and Cloud Run." A full repository scan (dependency manifest, source tree, and a case-insensitive grep for `gemini`, `vertexai`, `generative-ai`, `@google/genai`, `palm`, `dialogflow`) found **no Google AI / Generative AI SDK, API call, or integration anywhere in this codebase**. `.gemini/settings.json` exists but only configures the Gemini *CLI coding assistant* for this project (`{"contextFileName": "AGENTS.md"}`) — it is a developer tool, not an application dependency.

What this repository actually is: an **Astro 5 server-rendered marketing/product-catalog website** for a Maldivian FMCG (fast-moving consumer goods) distributor, currently mid-migration from a Wix-hosted CMS to **Firebase Hosting + Cloud Run + Firestore**. There is no user authentication, no AI feature, and no Cloud Functions in this repo. I audited what is actually present rather than inventing an AI layer to match the prompt — flagging this up front so the rest of the report isn't read against the wrong mental model. Section 1 documents the real architecture.

---

## 1. Architecture

### 1.1 Component inventory

| Layer | Technology | Evidence |
|---|---|---|
| Frontend rendering | Astro 5 (`output: "server"`), server-rendered HTML, no client-side framework in active use | `astro.config.mjs`, `src/pages/*.astro` |
| Frontend framework libs | `@astrojs/react` + `react` installed | `package.json` — **unused**, see Finding L-1 |
| Styling | Hand-authored CSS (`global.css`) + a **pre-compiled, statically checked-in Tailwind stylesheet** (`homepage.css`, 2,249 lines) — no live Tailwind build pipeline (no `tailwind.config.*`, no Tailwind dependency) | `src/styles/`, `package.json` |
| Backend/API | 3 Astro API routes running inside the same SSR server: `/api/health`, `/api/contact`, `/api/cms.json` | `src/pages/api/*.ts` |
| Compute | Single Cloud Run service `sosun-fihaara`, region `us-central1`, GCP project `website-c3acf`, serving the Astro Node SSR server (`@astrojs/node`, standalone adapter) | `package.json` deploy scripts, `Dockerfile` |
| Edge / CDN | Firebase Hosting in front of Cloud Run, wildcard rewrite of all paths to the Cloud Run service | `firebase.json` |
| Database | Cloud Firestore — collections `Products`, `Brands`, `SiteContent`, `Categories` — accessed **exclusively server-side** via the `firebase-admin` SDK with a service-account credential (or ADC) | `src/lib/cms.ts` |
| Auth | **None.** No Firebase Auth, no session/cookie handling, no login surface anywhere in `src/`. The site is a public, read-only catalog; the only "write" path is the (currently non-functional) contact form | confirmed via full-tree grep |
| Storage | No Cloud Storage bucket integration in the app itself. Product/brand images are still served from the legacy Wix CDN (`static.wixstatic.com`); Firebase Storage domains are allow-listed for a future migration but not yet used | `astro.config.mjs` `image.domains`, `src/lib/cms.ts` `resolveWixImage()` |
| Cloud Functions | None found | full-tree search |
| External APIs | Wix Data API (`wixapis.com`) — used only by the one-time migration script `seed-firestore.mjs` and the dev utility `fetch-cms.mjs`, not by the running application | root scripts |
| Google AI | **None** — see Section 0 | full-tree search |

### 1.2 Request flow

```
Browser
  → Firebase Hosting (dist/client static assets + wildcard rewrite)
    → Cloud Run "sosun-fihaara" (Astro Node SSR, port 8080)
      → src/middleware.ts (security headers)
        → route handler (page or /api/*)
          → src/lib/cms.ts → Firestore (firebase-admin, server-side only)
```

### 1.3 What this means for the rest of the report

Because there is no authentication and no client-side Firestore access, several standard "Firebase app" risk categories (JWT validation, Firestore Security Rules protecting end users, client SDK API-key exposure) are **structurally lower risk than in a typical Firebase app** — but that doesn't mean the security posture is good; it means the risk has moved to a smaller number of higher-stakes places: the service-account credential, the build/deploy pipeline, and the two write-capable endpoints. Sections 4 and 5 go through those in order of severity.

---

## 2. Deployment Analysis

### 2.1 Dockerfile (`/Dockerfile`)

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
```

Multi-stage build and `npm ci --omit=dev` in the runtime stage are both good practice. Three problems, in order of severity:

**D-1 (Critical) — No `.dockerignore`/`.gcloudignore`: live secrets and full git history are uploaded to Cloud Build on every deploy.**
- *Root cause:* `COPY . .` in the builder stage, combined with `deploy:cloudrun`'s `gcloud builds submit ... .` (see 2.2), uploads the **entire working directory** as the build context. There is no `.dockerignore` and no `.gcloudignore` anywhere in the repo (confirmed absent). That directory contains `.env.local` (live `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `WIX_CLIENT_SECRET`) and the full `.git/` history, which — per Finding S-1 below — contains a previously hardcoded Wix secret.
- *Impact:* Every `npm run deploy:cloudrun` ships the live Firebase Admin private key and Wix secret into a Cloud Storage staging bucket (Cloud Build's context upload) and bakes `.env.local` into the builder image layer. Anyone with read access to that GCS bucket, the Cloud Build logs, or the intermediate image layer gets full Firestore admin access to the project, not just this app's data.
- *Fix:*
  ```
  # .dockerignore and .gcloudignore (create both, identical content)
  .git
  .env
  .env.local
  .env.production
  .env.*.local
  node_modules
  dist
  .astro
  .firebase
  *.md
  .vscode
  .gemini
  ```
- *Why it works:* Both Docker and `gcloud builds submit` respect these ignore files when assembling the build context, so the excluded paths never leave the developer's machine. This is a build-context fix, not a code fix — it closes the leak at the one place all deploys funnel through.
- *Severity:* **Critical** — direct path to full database compromise, silently repeated on every deploy.

**D-2 (Medium) — Base image is tag-pinned, not digest-pinned; no non-root `USER`; no `HEALTHCHECK`.**
- *Root cause:* `FROM node:20-slim` floats to whatever `20-slim` resolves to at build time; no `USER` directive means the process runs as root inside the container.
- *Impact:* Non-reproducible builds (a `20-slim` rebuild upstream can change your runtime silently), and a slightly larger blast radius if the Node process is ever compromised (root inside the container, though Cloud Run's gVisor sandbox limits what that buys an attacker).
- *Fix:*
  ```dockerfile
  FROM node:20-slim@sha256:<pin-this-digest> AS builder
  ...
  FROM node:20-slim@sha256:<pin-this-digest>
  WORKDIR /app
  RUN addgroup --system app && adduser --system --ingroup app app
  COPY --from=builder --chown=app:app /app/dist ./dist
  COPY --chown=app:app package.json package-lock.json ./
  RUN npm ci --omit=dev
  USER app
  ENV HOST=0.0.0.0 PORT=8080
  EXPOSE 8080
  CMD ["node", "./dist/server/entry.mjs"]
  ```
- *Why it works:* Digest pinning makes builds reproducible; `USER app` drops root privileges for the actual running process, which is standard container-hardening practice and costs nothing functionally here (the app needs no root-only syscalls).
- *Severity:* **Medium.**

**D-3 (Medium/Missing info) — Cloud Run deploy command sets no scaling, resource, or access-control flags.**
- *Root cause:* `package.json`'s `deploy:cloudrun` script is:
  ```
  gcloud run deploy sosun-fihaara --project website-c3acf --region us-central1 \
    --image us-central1-docker.pkg.dev/website-c3acf/cloud-run-source-deploy/sosun-fihaara --quiet
  ```
  No `--min-instances`, `--max-instances`, `--memory`, `--cpu`, `--concurrency`, `--timeout`, or `--allow-unauthenticated`/IAM binding is specified.
- *Impact:* The service's actual scaling and access behavior is whatever was last set through the Console or a prior manual `gcloud` invocation — it is **not defined in code**, so nobody reviewing this repo (including this audit) can verify concurrency limits, min-instance cold-start mitigation, memory headroom for SSR + Firestore SDK, or whether the service is reachable directly (bypassing Firebase Hosting) by an unauthenticated caller.
- *What additional data is needed to verify:* Output of `gcloud run services describe sosun-fihaara --region us-central1 --format=json`, specifically `spec.template.metadata.annotations` (`autoscaling.knative.dev/minScale`, `.../maxScale`), `resources.limits`, `containerConcurrency`, and the service's IAM policy (`gcloud run services get-iam-policy`).
- *Fix (recommended baseline, then tune from real traffic data):*
  ```
  gcloud run deploy sosun-fihaara \
    --project website-c3acf --region us-central1 \
    --image us-central1-docker.pkg.dev/website-c3acf/cloud-run-source-deploy/sosun-fihaara \
    --min-instances=0 --max-instances=10 \
    --memory=512Mi --cpu=1 --concurrency=80 --timeout=30s \
    --no-allow-unauthenticated \
    --quiet
  ```
  Then grant Firebase Hosting's service agent `roles/run.invoker` explicitly (Firebase Hosting rewrites to Cloud Run need this even on a locked-down service), so the origin is only reachable through Hosting, not directly.
- *Severity:* **Medium**, escalating to **High** if `--allow-unauthenticated` is currently set *and* the direct `*.run.app` URL is discoverable — cannot confirm from the repo; flagged as a verification gap.

### 2.2 Environment variables & secrets handling

- `.env.local`, `.env`, `.env.production` are correctly listed in `.gitignore` and confirmed **not tracked** by git (`git ls-files | grep env` returns nothing). Good practice, and worth stating plainly since it's easy to assume the worst.
- However, the credential-loading pattern in `src/lib/cms.ts` reads `FIREBASE_PRIVATE_KEY` as a **plain environment variable**, which the deploy tooling has no defined path for populating on Cloud Run (see D-3 — the deploy script never sets `--set-env-vars` or `--set-secrets`). This means either (a) env vars are being set manually in the Console, unreviewable and easy to lose on redeploy, or (b) the service is currently falling back to Application Default Credentials, in which case the Cloud Run service's *runtime service account* is what actually gates Firestore access — and its IAM role bindings are unknown from this repo (see S-4).
- *Fix:* Move the credential to Secret Manager and bind it at deploy time instead of relying on Console-set env vars:
  ```
  gcloud run deploy sosun-fihaara \
    --set-secrets=FIREBASE_PRIVATE_KEY=firebase-admin-key:latest \
    ...
  ```
  Simpler and more idiomatic: **drop the explicit-credential path entirely** and rely purely on ADC, granting the Cloud Run runtime service account exactly `roles/datastore.user` (Firestore) — no key material to manage or leak at all. `src/lib/cms.ts` already supports this fallback (`initializeApp()` with no args).
- *Severity:* **High** (tied to the D-1 leak; this is the piece that determines how bad that leak actually is).

---

## 3. Debugging

**BUG-1 (Critical) — Product data-binding mismatch breaks the two main commerce pages.**
- *Root cause:* `src/lib/cms.ts::getProducts()` returns fully-named fields: `name`, `brandName`, `category`, `subcategory`, `price`, `packSize`, `image`, `code`. But two page templates still read the **old short-key schema** from a prior (pre-rename) version of the data layer:
  - `src/pages/products.astro` — lines 21–41 filter/sort on `p.b`, `p.cat`, `p.sub`, `p.n`, `p.pr`; the render loop (lines 115–131) reads `p.b`, `p.n`, `p.img`, `p.cat`, `p.p`, `p.pr`, `p.c`.
  - `src/pages/brands/[slug].astro` — line 13 filters on `p.b`; the render loop (lines 32–47) reads `p.img`, `p.n`, `p.b`, `p.cat`, `p.p`, `p.pr`, `p.c`.

  None of `b`, `n`, `pr`, `img`, `c`, `cat`, `sub`, `p` exist on the current `Product` type. `FIXES.md` (item #21, `QUAL-001`) claims this rename was completed and checked off — it was applied to `cms.ts`, `src/pages/products/[code].astro`, and `src/pages/index.astro` (all verified correct), but **not** to `products.astro` or `brands/[slug].astro`.
- *Impact:* On the main `/products` catalog page and every `/brands/{slug}` page, every product renders with a blank name, broken image (`<img src="undefined">`), missing price, and blank category label. The client-side brand/category filter script (`products.astro`, lines 116, 149–174) keys off `data-brand`/`data-cat`/`data-sub` attributes built from the same undefined fields, so filtering silently returns nothing. This is the core product-browsing experience for a distribution company's website — effectively the storefront is broken.
- *Fix:* In `src/pages/products.astro`:
  ```diff
  - if (brandFilter && p.b !== brandFilter) return false;
  - if (catFilter && p.cat !== catFilter) return false;
  - if (subFilter && p.sub !== subFilter) return false;
  + if (brandFilter && p.brandName !== brandFilter) return false;
  + if (catFilter && p.category !== catFilter) return false;
  + if (subFilter && p.subcategory !== subFilter) return false;
  ```
  ```diff
  - <article class="pcard pcard--brand" data-brand={p.b} data-cat={p.cat} data-sub={p.sub} data-price={p.pr ...} data-name={p.n}>
  -   <img src={p.img} alt={p.n} loading="lazy">
  -   <span class="pcard__cat">{p.b} &middot; {p.cat}</span>
  -   <h3>{p.n}</h3>
  -   {p.p && <p>Pack: {p.p}</p>}
  -   {p.pr ? <p>MVR {p.pr}</p> : <p>Request price</p>}
  -   <a href={`/products/${p.c}`}>Explore More</a>
  + <article class="pcard pcard--brand" data-brand={p.brandName} data-cat={p.category} data-sub={p.subcategory} data-price={p.price ...} data-name={p.name}>
  +   <img src={p.image} alt={p.name} loading="lazy">
  +   <span class="pcard__cat">{p.brandName} &middot; {p.category}</span>
  +   <h3>{p.name}</h3>
  +   {p.packSize && <p>Pack: {p.packSize}</p>}
  +   {p.price ? <p>MVR {p.price}</p> : <p>Request price</p>}
  +   <a href={`/products/${p.code}`}>Explore More</a>
  ```
  Apply the equivalent rename in `src/pages/brands/[slug].astro` (`p.b`→`p.brandName`, `p.n`→`p.name`, `p.img`→`p.image`, `p.cat`→`p.category`, `p.p`→`p.packSize`, `p.pr`→`p.price`, `p.c`→`p.code`), and change `brands.find((b: any) => ...)` / `allProducts.filter((p: any) => p.b === brand.name)` to use `p.brandName` and proper `Product`/`Brand` types instead of `any` (see Q-2).
- *Why it works:* This restores field-name parity with the actual `Product`/`Brand` interfaces exported from `cms.ts`, which is exactly the contract `products/[code].astro` and `index.astro` already correctly rely on — no data-layer change needed, only the two stale templates.
- *Severity:* **Critical** — silent, total breakage of the primary user-facing feature, with no error thrown (TypeScript's `any` typing on these variables is exactly why this compiled without complaint — see Q-2).

**BUG-2 (High) — Contact form accepts submissions but delivers them nowhere.**
- *Root cause:* `src/pages/api/contact.ts` validates and sanitizes input correctly, then:
  ```ts
  // TODO: Send via Resend / SendGrid or store in Wix CRM
  console.log('[contact] Form submission:', { name, email, phone, company, messageLength: message.length });
  ```
  and redirects the user to a success page regardless.
- *Impact:* Every wholesale/retail inquiry a visitor submits is discarded except as a Cloud Logging line. The user sees "success." Sales leads are silently lost, and there is no way to detect this from the outside — the form *looks* like it works.
- *Fix:* Wire it to a real destination before launch — e.g., write to a `ContactSubmissions` Firestore collection (consistent with the rest of the app's data layer) and/or send via a transactional email API:
  ```ts
  import { getFirestore } from 'firebase-admin/firestore';
  // ...after validation passes:
  await getFirestore().collection('ContactSubmissions').add({
    name, email, phone, company, message,
    submittedAt: FieldValue.serverTimestamp(),
    origin,
  });
  ```
  and/or a SendGrid/Resend call gated behind an API key stored in Secret Manager, not `.env.local`.
- *Why it works:* Persisting to Firestore uses infrastructure the app already has provisioned and authenticated; it's the smallest change that turns "logged and lost" into "recoverable and actionable."
- *Severity:* **High** — direct business impact (lost sales leads), not a code-crash bug, so it will not surface in error monitoring.

**BUG-3 (High) — Content-Security-Policy blocks the site's own font requests.**
- *Root cause:* `src/middleware.ts` sets `style-src 'self' 'unsafe-inline'` and `font-src 'self'` on every response. Two things in the codebase still pull fonts from Google's CDN under that policy:
  - `src/layouts/Layout.astro` (used by `about`, `products`, `brands`, `contact`, `news`, `recipes`, `products/[code]`, `brands/[slug]`) has `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alumni+Sans+SC...&family=Lato...">`.
  - `src/styles/homepage.css` (used by `HomeLayout.astro`, i.e. the **homepage**, `index.astro`) opens with `@import url('https://fonts.googleapis.com/css2?family=Alumni+Sans+SC...&family=Lato...');`.

  `FIXES.md` item #38 (`BUG-HTML-001`) claims the Google Fonts `<link>` was removed from `Layout.astro` as "unused" — it is still present in the file as read during this audit, and the `@import` in `homepage.css` was never addressed at all.
- *Impact:* Both requests are same-origin-only under the current CSP, so the browser blocks them and logs a CSP violation to the console on **every page load, including the homepage**. Since `index.astro`'s markup uses `font-alumni`/`font-lato` utility classes that depend on exactly these two Google font families, the homepage silently falls back to system fonts sitewide — a visible design regression, not just console noise.
- *Fix — pick one, don't do both:*
  - **Self-host (recommended, matches what was already done for the other three font families in `public/fonts/`):** download Alumni Sans SC + Lato `.woff2` files, add matching `@font-face` blocks to `homepage.css`/`global.css`, delete the `<link>` and `@import`. No CSP change needed.
  - **Or, if self-hosting isn't feasible right now:** widen the CSP explicitly and knowingly:
    ```diff
    - "style-src 'self' 'unsafe-inline'",
    - "font-src 'self'",
    + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    + "font-src 'self' https://fonts.gstatic.com",
    ```
- *Why self-hosting is the better fix:* it removes a third-party runtime dependency and an extra DNS/TLS round trip from the critical rendering path (see Performance section), rather than just re-permitting it in the CSP.
- *Severity:* **High** — affects the homepage, the highest-traffic page, on every load.

---

## 4. Performance Audit

**PERF-1 (Medium) — Per-instance in-memory cache undermines both consistency and cold-start cost on Cloud Run.**
- *Root cause:* `src/lib/cms.ts` keeps a module-level `Map` (`_cache`, 5-minute TTL) keyed by query shape. Cloud Run can and will run multiple instances concurrently under load, and will spin up a fresh instance (empty cache) on every scale-out event or after scale-to-zero. `FIXES.md` already lists this as open work (`DATA-001`/`DATA-002`, unchecked).
- *Impact:* Two users hitting different instances within the same 5-minute window can see different content ages; every cold start pays a full Firestore round-trip (or several, since `getCmsData()` fans out to three parallel queries) before serving its first request, directly adding to Cloud Run cold-start latency.
- *Fix:* For a low-write, content-catalog workload like this, the simplest correct fix is Astro's HTTP-level caching (already partially done — see `cms.json.ts`'s `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`) applied consistently to the page routes too, plus Firebase Hosting/CDN caching in front of Cloud Run for the SSR HTML itself where content doesn't vary per-request. If in-process caching is still wanted as a secondary layer, cap its blast radius and add a manual-refresh path (a `?refresh=<token>` query param or a Firestore-triggered Cloud Function that calls Cloud Run's internal cache-bust endpoint) — both already identified as open items in `FIXES.md` (`DATA-002`).
- *Severity:* **Medium** — correctness/staleness risk plus avoidable latency, not a crash.

**PERF-2 (Medium) — Full-collection fetch + in-memory filtering instead of query-level filtering.**
- *Root cause:* `getProducts()` fetches up to 1,000 documents from `Products` on every cache-miss; `products.astro` then does brand/category/subcategory filtering, price parsing, and sorting entirely in JavaScript after the fetch, rather than pushing `where()`/`orderBy()` constraints to Firestore per active filter.
- *Impact:* At the README-stated catalog size (~548 products), this is not yet a user-visible problem, but every cache-miss reads the entire collection regardless of which single brand or category the visitor actually asked for — Firestore document-read costs scale with total catalog size × cache-miss rate, not with result-set size, and this gets worse linearly as the catalog grows.
- *Fix:* Build the Firestore query dynamically from the active filters before calling `.get()`, e.g.:
  ```ts
  let q = db.collection("Products").where("active", "==", true);
  if (brandFilter)   q = q.where("brandName", "==", brandFilter);
  if (catFilter)     q = q.where("category", "==", catFilter);
  q = q.orderBy("name", "asc").limit(pageSize);
  ```
  (requires a couple of composite indexes — Firestore will tell you exactly which via the error message the first time you run it).
- *Why it works:* Firestore bills and rate-limits per document read; narrowing the query server-side means a filtered view only reads the documents it actually needs, and enables real server-side pagination instead of `slice(0, page * pageSize)` (which itself re-fetches and re-slices the *entire* filtered set on every "Load More" click — see also BUG-1's filter-key bug, which currently makes this moot because the filters don't work at all).
- *Severity:* **Medium**, rising with catalog growth.

**PERF-3 (Low) — Homepage ships an unused React runtime and a 2,249-line static CSS file with no build-time purge.**
- *Root cause:* `@astrojs/react` + `react` are installed and registered as an Astro integration (`astro.config.mjs`) but zero components in `src/` import React or use a `client:*` hydration directive. Separately, `homepage.css` is a hand-frozen Tailwind output with no `tailwind.config.*` in the repo, so it can't be re-purged/rebuilt — it only continues to work by accident, as long as nobody adds a class to `index.astro` that isn't already present verbatim in that 2,249-line file.
- *Impact:* Extra dependency weight and Astro integration overhead for a framework never used (small but real: React + react-dom in the dependency graph, plus `@astrojs/check`/`astro check` type-checking React files that don't exist). The frozen CSS is a maintainability/perf risk more than a current perf problem — it *works today* but any future markup change silently degrades rather than failing a build.
- *Fix:* Remove `@astrojs/react` and `react` from `package.json` and the `integrations: [react()]` line in `astro.config.mjs` unless there's a concrete near-term plan to use it. For the CSS, either commit to a real Tailwind build step (`tailwindcss` + `tailwind.config.mjs` + a `postcss` build script) or accept the static file as intentional and document it clearly in `AGENTS.md`/`README.md` so a future editor doesn't add a class expecting Tailwind's JIT compiler to catch it.
- *Severity:* **Low.**

**PERF-4 (Missing information) — No visibility into actual Cloud Run latency, cold-start frequency, or CDN cache-hit rate.**
- *What's missing:* Cloud Run request latency percentiles (Cloud Monitoring), cold-start counts, Firebase Hosting cache-hit ratio, and Firestore read-operation counts/costs are all only knowable from the live GCP project, which this audit did not have access to.
- *What to pull before prioritizing further perf work:* `gcloud run services describe`, Cloud Monitoring dashboards for `run.googleapis.com/request_latencies` and `container/instance_count`, and Firebase Hosting's usage tab for cache-hit rate.

---

## 5. Security Audit

**S-1 (Critical) — A real Wix API client secret is committed in git history and recoverable today.**
- *Root cause:* `git log -p -- src/lib/cms.ts fetch-cms.mjs` shows a hardcoded fallback secret that was committed and later "removed" from the working tree, but git history retains every version:
  ```ts
  const clientSecret = import.meta.env.WIX_CLIENT_SECRET || "[REDACTED — see git history, commit 48a7f8f; rotate this credential before treating it as historical]";
  ```
  `FIXES.md` (SEC-001) correctly identifies this as fixed *in the working tree* and explicitly warns "still in git history... you must rotate it" — but there is no evidence in the repo of whether rotation actually happened, and the secret is trivially recoverable by anyone with clone access via `git log -p` or `git show <old-commit>`.
- *Impact:* If this secret was never rotated, anyone with read access to this repository (including this audit, incidentally) has a live Wix API credential capable of querying/mutating this business's Wix CMS data collections.
- *Fix:*
  1. **Rotate the credential immediately** in the Wix Dashboard (Settings → Advanced Settings → API Keys), regardless of whether you believe this was already done — treat it as compromised until proven otherwise.
  2. **Scrub git history**, not just the working tree: `git filter-repo --path src/lib/cms.ts --path fetch-cms.mjs --invert-paths` is destructive to history and requires force-pushing and re-cloning by every collaborator, so coordinate it — or, simpler given this secret is being retired anyway (per README, Wix is being phased out), just confirm rotation and accept the historical exposure as closed once the old value is dead.
  3. Add a pre-commit/CI secret scanner (`gitleaks`, `trufflehog`) so this class of mistake can't recur silently.
- *Severity:* **Critical** until rotation is confirmed.

**S-2 (Critical) — See D-1.** Live Firebase Admin credentials and full git history (containing S-1's secret) are uploaded to Cloud Build on every deploy due to missing `.dockerignore`/`.gcloudignore`. Cross-referenced here because it compounds S-1: even after rotating the Wix secret, the *live* Firebase private key is exposed by the same missing-ignore-file root cause on every future deploy until D-1 is fixed.

**S-3 (High) — Firestore Security Rules are not present in the repository, version-controlled, or deployable via this repo's tooling.**
- *Root cause:* No `firestore.rules` or `storage.rules` file exists anywhere in the tree, and `firebase.json` has no `firestore` key at all (only `hosting`). Whatever rules exist live solely in the Firebase Console.
- *Impact:* Today, exploitability is low because the only Firestore access path in this codebase is server-side via the Admin SDK, which **bypasses Security Rules entirely** — so the current rules content doesn't gate anything the app does. But that also means: (a) there is zero audit trail or code review for whatever rules *are* set, (b) a newly created Firebase project defaults to either fully-locked or 30-day "test mode" (`allow read, write: if true`) rules, and if that default was never explicitly tightened, the project is one accidental client-side SDK addition away from being wide open, with nothing in this repo to catch it, and (c) this becomes an immediate real risk the moment anyone adds client-side Firebase usage (e.g., a future "save this to my list" feature) without first checking Console state that isn't visible to code review.
- *Fix:* Add explicit, version-controlled rules even though nothing reads them today, and wire them into deploy:
  ```
  // firestore.rules
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if false; // Admin SDK bypasses this; deny all client access explicitly.
      }
    }
  }
  ```
  ```diff
  // firebase.json
  {
  +  "firestore": { "rules": "firestore.rules" },
     "hosting": { ... }
  }
  ```
  and `firebase deploy --only firestore:rules` as part of the deploy script.
- *Why it works:* Making the "deny all client access" intent explicit and file-based means it's reviewable in PRs, deployed deterministically, and impossible to accidentally leave in test-mode without it being visible in a diff.
- *Severity:* **High** — low exploitability today, but a landmine for the first developer who adds any client-side Firebase call.

**S-4 (High/Missing information) — Runtime IAM role of the Cloud Run service account cannot be verified from the repo.**
- *What's missing:* Whether the Cloud Run service runs under a dedicated, least-privilege service account (ideally scoped to just `roles/datastore.user`) or the **default Compute Engine service account**, which typically carries `roles/editor` on the project — a massive over-grant for an app that only needs to read/write four Firestore collections.
- *What to check:* `gcloud run services describe sosun-fihaara --region us-central1 --format="value(spec.template.spec.serviceAccountName)"`, then `gcloud projects get-iam-policy website-c3acf` filtered to that service account.
- *Fix if it turns out to be the default account:*
  ```
  gcloud iam service-accounts create sosun-fihaara-run \
    --display-name="Sosun Fihaara Cloud Run runtime"
  gcloud projects add-iam-policy-binding website-c3acf \
    --member="serviceAccount:sosun-fihaara-run@website-c3acf.iam.gserviceaccount.com" \
    --role="roles/datastore.user"
  gcloud run services update sosun-fihaara --region us-central1 \
    --service-account=sosun-fihaara-run@website-c3acf.iam.gserviceaccount.com
  ```
- *Severity:* **High if default SA confirmed, otherwise N/A** — flagged as a required verification, not asserted as fact.

**S-5 (Medium) — No rate limiting on write/compute-triggering endpoints (OWASP API4:2023 — Unrestricted Resource Consumption).**
- *Root cause:* `/api/contact` (accepts arbitrary POSTs, currently free of any throttle) and `/api/cms.json` (triggers a Firestore read fan-out on cache-miss) have no per-IP or per-token rate limiting. Cloud Run's origin-based CORS/origin check (`isAllowedOrigin`) only checks the `Origin` header, which is trivially spoofable from a non-browser client (curl, a script) since browsers are the only thing that reliably sends real `Origin` headers.
- *Impact:* A scripted flood of POSTs to `/api/contact` or GETs to `/api/cms.json` bypasses the origin check entirely (server-to-server requests don't send `Origin`, and `isAllowedOrigin(null)` returns `true` by design — see `origins.ts` line 39, `"same-origin SSR requests have no Origin header"`), and drives Cloud Run scale-out and Firestore read costs — a cost-based denial-of-wallet vector even without crashing anything.
- *Fix:* Put Firebase App Check or a simple token-bucket (e.g., Cloud Armor rate limiting in front of Cloud Run, or an in-memory/Firestore-backed limiter keyed by IP for `/api/contact`) in front of both endpoints; for the contact form specifically, add a CAPTCHA (reCAPTCHA/hCaptcha/Turnstile) since it's public-facing and currently has zero bot defense beyond field-length limits.
- *Severity:* **Medium.**

**S-6 (Medium) — Verbose/PII-bearing logs with no structure or redaction.**
- *Root cause:* `contact.ts` logs full name/email/phone/company to stdout on every submission; `cms.json.ts` logs raw error objects. On Cloud Run this lands directly in Cloud Logging as plaintext, unstructured, with no request-correlation ID (`FIXES.md`'s own `REL-003` is open for exactly this reason).
- *Impact:* PII sitting in log storage without a defined retention/access policy is a data-handling risk (relevant if this business ever needs GDPR/local data-protection compliance for Maldivian or international customers), and unstructured logs make debugging production incidents slower.
- *Fix:* Switch to structured JSON logging (`console.log(JSON.stringify({ severity: 'INFO', message: 'contact_form_submission', email_domain: email.split('@')[1], ...}))` — log a hashed/truncated identifier instead of the raw email where possible), and set a Cloud Logging retention/sink policy appropriate for the data.
- *Severity:* **Medium.**

**S-7 (Low) — Dependency vulnerabilities confirmed via `npm audit`.**
- *Root cause:* Running `npm audit --omit=dev` against the committed `package-lock.json` reports **11 vulnerabilities (1 low, 9 moderate, 1 high)**, all rooted in `firebase-admin@13.10.0`'s transitive chain: `@google-cloud/firestore` → `google-gax` → `gaxios`/`teeny-request`/`retry-request` → a vulnerable `uuid` range.
- *Impact:* These are dependency-of-dependency advisories in Google's own client libraries, not exploitable application logic in this repo — but they are real, currently-installed, and worth tracking.
- *Fix:* `npm audit fix` first (non-breaking); if the high-severity item persists, evaluate `npm audit fix --force` (npm's own output flags this would downgrade `firebase-admin` to `10.3.0`, a breaking change) against upgrading to whatever current `firebase-admin` major has already resolved the transitive `uuid`/`gaxios` versions, rather than force-downgrading.
- *Severity:* **Low** (no known exploit path from this app's usage pattern), but should be tracked to avoid drifting further behind.

**S-8 (Not applicable / explicitly confirmed absent) — Authentication, JWT validation, OWASP session-management items.**
- There is no login system, no session/cookie handling, and no JWT anywhere in this codebase to validate. This is not a gap given the site's purpose (public catalog, no user accounts) — noted here only so it isn't mistaken for an unreviewed area. If an admin/CMS-editing UI is ever added to this app directly (as opposed to editing via the Firebase Console), it will need real authentication designed in from the start, including JWT/session validation, RBAC, and CSRF protection on any state-changing form.

---

## 6. Codebase Review

**Q-1 (Medium) — `FIXES.md` overstates completion; it is not a reliable source of current state.**
- Item #21 (`QUAL-001`, "Renamed single-letter product keys... to full names") and item #38 (`BUG-HTML-001`, "Removed unused Google Fonts link") are both marked `[x]` complete but are contradicted by the current working tree (see BUG-1 and BUG-3 above). This means the tracker was likely marked done based on a partial find-and-replace or a different branch state, and nobody re-verified against the files that actually shipped.
- *Recommendation:* Treat `FIXES.md` as a historical log, not a live status board. Before trusting any "done" claim in it for launch-readiness sign-off, grep the actual file for the described change (as this audit did) rather than taking the checkbox at face value.

**Q-2 (Medium) — Widespread `any` typing defeats the type system exactly where it would have caught BUG-1.**
- `brands/[slug].astro`, `products.astro`, and several `.map()` callbacks across `index.astro` type their CMS data as `any` (`brands.find((b: any) => ...)`, `allProducts.filter((p: any) => ...)`) despite `cms.ts` exporting proper `Product`/`Brand`/`Category` interfaces, and despite `tsconfig.json` extending `astro/tsconfigs/strict`. Strict mode is enabled at the project level but silently defeated at each call site via explicit `any` annotations.
- *Fix:* Import and use the real types (`import type { Product, Brand } from '../../lib/cms'`) everywhere CMS data is consumed; that alone would have made BUG-1's `p.b`/`p.n`/etc. accesses a compile-time error (`astro check && tsc --noEmit` — already a defined `npm run check` script — would have caught it had the types not been erased with `any`).
- *Severity:* **Medium** — this is the systemic root cause behind BUG-1, not just a style nit.

**Q-3 (Low) — Dead code and migration debris left in the repository.**
- `fetch-cms.mjs` (Wix CLI debug script), `.vscode/launch.json` (still launches `wix dev`, which isn't installed per `package.json`), `src/components/Footer.astro.bak`, `src/styles/global.css.bak`, `public/og-default.png.png` (double extension). None of these break anything, but they actively confuse anyone new to the repo about which parts of the Wix migration are still live (answer: none of the Wix code paths run in production; only the one-time `seed-firestore.mjs` and the dev-only `fetch-cms.mjs` touch Wix at all).
- *Fix:* Delete `.bak` files (git history already preserves prior versions), delete or clearly relocate `fetch-cms.mjs` to a `scripts/one-time/` folder with a README note, and update `.vscode/launch.json` to launch `npm run dev` instead of `wix dev`.

**Q-4 (Low) — No automated tests, no CI.**
- `package.json` has no test runner and no `test` script; there is no `.github/workflows/` directory. `FIXES.md`'s own Phase 4 lists unit tests, integration tests, E2E smoke tests, and a CI/CD pipeline as open items (`[ ]`), and `AGENTS.md` doesn't reference any test tooling either.
- *Impact:* Every deploy is a manual, ungated `npm run deploy` from a developer's machine (which, per D-1, also currently leaks secrets). Combined with BUG-1, this is exactly the failure mode automated tests exist to catch: a template reading a field name that doesn't exist would fail a basic Playwright smoke test ("product name is visible on /products") instantly.
- *Fix:* At minimum, add one Playwright smoke test per page asserting key content renders (product name/price/image are non-empty strings), and a GitHub Actions workflow running `npm run check` + the smoke tests on every PR before `npm run deploy` is ever run by hand.

---

## 7. Consolidated Findings Register

| ID | Finding | Area | Severity |
|---|---|---|---|
| D-1 | No `.dockerignore`/`.gcloudignore` — secrets + `.git` uploaded on every deploy | Deployment/Security | **Critical** |
| S-1 | Wix client secret hardcoded and recoverable in git history | Security | **Critical** |
| BUG-1 | Product/brand page field-name mismatch breaks catalog + filtering | Debugging | **Critical** |
| S-2 | Live Firebase Admin key exposed via D-1 on every deploy | Security | **Critical** |
| BUG-2 | Contact form discards all submissions (logs only) | Debugging | **High** |
| BUG-3 | CSP blocks Google Fonts on every page incl. homepage | Debugging | **High** |
| S-3 | No version-controlled Firestore Security Rules | Security | **High** |
| S-4 | Cloud Run service-account IAM scope unverified (possible over-grant) | Security | **High** |
| D-3 | Cloud Run deploy has no scaling/resource/IAM flags defined in code | Deployment | **High**\* |
| S-5 | No rate limiting / bot defense on contact + CMS endpoints | Security | **Medium** |
| S-6 | PII/logs unstructured, no redaction | Security | **Medium** |
| PERF-1 | Per-instance in-memory cache, no invalidation | Performance | **Medium** |
| PERF-2 | Full-collection fetch + in-memory filter/sort/paginate | Performance | **Medium** |
| D-2 | Docker: tag-pinned base, runs as root, no HEALTHCHECK | Deployment | **Medium** |
| Q-1 | `FIXES.md` overstates completion vs. actual code | Code Review | **Medium** |
| Q-2 | Widespread `any` typing defeats strict TS mode | Code Review | **Medium** |
| S-7 | 11 npm audit findings (transitive, firebase-admin chain) | Security | **Low** |
| PERF-3 | Unused React integration + frozen, unpurgeable Tailwind CSS | Performance/Code | **Low** |
| Q-3 | Dead code / Wix migration debris | Code Review | **Low** |
| Q-4 | No automated tests, no CI | Code Review | **Low**\*\* |
| PERF-4 | No live latency/cold-start/cache-hit data available | Performance | Missing info |

\* Severity conditional on live IAM/access-control state, which this audit could not verify.
\*\* Rated Low in isolation, but is the systemic reason BUG-1 shipped undetected — treat as higher priority in practice.

---

## 8. Scores

Scored 0–10 against the repository and deploy configuration as reviewed; live-environment factors that could not be verified (marked throughout) are treated conservatively (assumed default/unhardened) rather than assumed safe.

| Dimension | Score | Rationale |
|---|---|---|
| **Architecture** | 6/10 | Clean, simple, appropriately-sized stack for the actual workload (a content site, not the AI/complex system implied by the original ask). Loses points for the unfinished Wix→Firebase migration leaving two parallel data-shape conventions live simultaneously (root cause of BUG-1), and for an installed-but-unused React integration. |
| **Security** | 3/10 | Two Critical, uncontained secret-exposure paths (S-1, D-1/S-2) that are live today, plus no version-controlled Firestore rules and an unverified IAM scope. Dragged down further because these aren't theoretical OWASP-checklist items — they were found active in the current repo state. |
| **Performance** | 5/10 | Fine at current traffic/catalog size; the caching and full-scan-then-filter patterns are the kind of thing that degrades gradually rather than breaking outright, which is exactly why they haven't been prioritized yet. No live metrics available to confirm actual latency. |
| **Scalability** | 4/10 | Per-instance cache and in-memory filter/pagination don't scale with either traffic or catalog size; Cloud Run scaling parameters aren't defined in code so current headroom is unknown. |
| **Maintainability** | 4/10 | `any`-typed data access defeating strict TypeScript, a status tracker (`FIXES.md`) that doesn't match reality, and leftover migration debris all compound to make "is this actually working" hard to answer without manually reading every template — as this audit had to do. |
| **Reliability** | 4/10 | No automated tests or CI means regressions like BUG-1 ship silently; the contact form failing "successfully" (BUG-2) is the same pattern — no test or monitoring would catch a feature that appears to work but doesn't. |
| **Overall** | **4.3/10** | A reasonably-architected small content site let down by an incomplete migration, a leaking build pipeline, and zero regression safety net. Nothing here requires a rebuild — the fix list is concrete and short — but several items (D-1, S-1, BUG-1) should be treated as stop-ship until resolved. |

---

## 9. Prioritized Action Plan

**Do before the next deploy (hours, not days):**
1. Add `.dockerignore` + `.gcloudignore` (D-1 / S-2) — every subsequent deploy leaks secrets until this exists.
2. Rotate the Wix client secret (S-1) and confirm the rotation actually happened; treat as compromised until proven otherwise.
3. Fix the field-name mismatch in `products.astro` and `brands/[slug].astro` (BUG-1) — the storefront is currently non-functional for browsing/filtering.
4. Wire `/api/contact` to an actual destination (BUG-2) — every day this ships as-is is lost sales leads.

**Do this week:**
5. Fix the CSP/font conflict (BUG-3) — self-host the two missing font families.
6. Verify Cloud Run's IAM policy and service-account role (S-4); tighten if it's the default Compute SA or `--allow-unauthenticated` with no Hosting-only enforcement.
7. Add explicit `firestore.rules` denying all client access and wire it into `firebase.json` (S-3).
8. Set explicit `--min-instances`/`--max-instances`/`--memory`/`--concurrency` on the Cloud Run deploy (D-3), based on real traffic once S-4/S-3 are settled.

**Do this month:**
9. Replace `any` with the real `Product`/`Brand`/`Category` types everywhere (Q-2) and add `npm run check` as a required CI step (Q-4) — this pairing would have caught BUG-1 automatically.
10. Add server-side query filtering to replace full-collection-fetch-then-filter (PERF-2), and resolve the cache invalidation gap (PERF-1).
11. Add rate limiting/CAPTCHA to `/api/contact` (S-5), structured logging with PII care (S-6).
12. Clean up dead code (Q-3), drop the unused React integration (PERF-3), run `npm audit fix` (S-7).

**Ongoing:**
13. Stand up basic Playwright smoke tests + a CI workflow gating deploys (Q-4) — the single highest-leverage change here, since it would have caught three of this report's Critical/High findings automatically.

---

## Appendix: What could not be verified from this repository

The following require access to the live GCP project / Firebase Console and were **not assumed** — they are called out as verification gaps rather than scored as if confirmed good or bad:

- Actual Cloud Run scaling config, resource limits, concurrency, and IAM/invoker policy (D-3, S-4).
- Whether `--allow-unauthenticated` is currently set and whether the direct `*.run.app` URL is reachable, bypassing Firebase Hosting.
- The actual content of Firestore Security Rules as configured in the Console today (S-3).
- The Cloud Run runtime service account's actual IAM role bindings (S-4).
- Whether the Wix client secret (S-1) has already been rotated since `FIXES.md` was written on 2026-06-28/30.
- Live latency, cold-start frequency, Firestore read volume/cost, and CDN cache-hit rate (PERF-4).
- Whether `.env.local` values currently deployed to Cloud Run match what's in the local file reviewed here, or were set independently via Console/`--set-env-vars` at some point.
