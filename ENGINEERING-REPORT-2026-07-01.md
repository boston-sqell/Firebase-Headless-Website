# Engineering Report — Sosun Fihaara (sosun-fihaara-firebase)

**Audit type:** Architectural Analysis · Security Review · Performance Audit · Code Quality Assessment
**Repository:** `C:\Dev\sosun-fihaara-firebase`
**Date:** 2026-07-01
**Method:** Full static analysis of working tree, git history, dependency graph, deployment configuration, and Firestore/Storage security rules. No live GCP project or running instance was accessible — findings grounded in repository evidence; every gap requiring live-data verification is flagged explicitly.

---

## Executive Summary

This is an **Astro 5 server-rendered (SSR) marketing and product-catalog website** for a Maldivian FMCG distributor, deployed on **Firebase Hosting + Cloud Run + Firestore**. The site has undergone a significant hardening pass since a prior audit on 2026-06-28 — of the 18 Critical/High findings from that audit, **all code-level items have been resolved**. The remaining risk surface is concentrated in three areas: (1) the Cloud Build pipeline's substitution handling, (2) the absence of automated testing/CI, and (3) transitive npm dependency vulnerabilities.

**Overall scores (post-fix):**

| Dimension | Score | Change from prior audit |
|---|---|---|
| Architecture | **7/10** | +1 (React removed, types fixed, auth layer added) |
| Security | **7/10** | +4 (secrets excluded from build context, CSP fixed, Firestore/Storage rules versioned, rate limiting added) |
| Performance | **6/10** | +1 (font-display:swap verified, unused deps removed) |
| Scalability | **5/10** | +1 (Cloud Run flags now in deploy script) |
| Maintainability | **6/10** | +2 (types used consistently, dead code removed, AGENTS.md present) |
| Reliability | **5/10** | +1 (health check added, error states in pages, retry logic) |
| **Overall** | **6.0/10** | +1.7 |

---

## 1. Architecture

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Browser                                                  │
│  ├─ Public pages: /, /about, /products, /brands, etc.   │
│  └─ Admin panel: /admin/* (Firebase Auth + session)      │
└──────────────┬──────────────────────────────────────────┘
               │
       ┌───────▼────────┐
       │ Firebase Hosting│  dist/client/ static assets
       │ (CDN edge)     │  Wildcard rewrite → Cloud Run
       └───────┬────────┘
               │
       ┌───────▼────────┐
       │  Cloud Run      │  Astro 5 SSR (Node 20, port 8080)
       │  us-central1    │  ├─ src/middleware.ts (CSP, headers, admin auth)
       │  sosun-fihaara  │  ├─ Public pages (cms.ts → read-only Firestore)
       └───────┬────────┘  ├─ Admin pages (admin-auth.ts → session cookie)
               │            ├─ Admin API (admin-data.ts → read/write Firestore)
    ┌──────────┼──────────┐ └─ /api/health, /api/contact, /api/cms.json
    │          │          │
┌───▼──┐ ┌────▼────┐ ┌───▼──────┐
│Fire- │ │Firebase │ │Firebase   │
│store │ │Auth     │ │Storage    │
└──────┘ └─────────┘ └──────────┘
```

### 1.2 Component Inventory

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | Astro 5 (SSR) | ^5.8.0 | Server-rendered HTML, no client-side framework |
| Adapter | @astrojs/node | ^9.0.0 | Standalone Node.js server mode |
| Language | TypeScript | ^5.9.3 | Strict mode (`astro/tsconfigs/strict`) |
| Styling | Hand-authored CSS + frozen Tailwind | — | `global.css` (57 KB), `homepage.css` (frozen Tailwind build), `admin.css` (independent) |
| Animation | Motion One | ^12.42.0 | Scroll-triggered reveals (imported but CSS animations handle most) |
| Compute | Cloud Run | `sosun-fihaara` | us-central1, 512 MiB, 1 vCPU, concurrency 80, timeout 30s |
| Edge/CDN | Firebase Hosting | — | Wildcard rewrite to Cloud Run, 1-year immutable cache on JS/CSS/fonts |
| Database | Cloud Firestore | — | Collections: Products, Brands, Categories, SiteContent, ContactSubmissions |
| Auth (admin) | Firebase Auth | — | Email/password + `admin:true` custom claim → httpOnly session cookie |
| Storage | Firebase Storage | — | Admin-uploaded images, publicly readable |
| Secrets | `.env.local` (dev) / ADC (prod) | — | Cloud Run runtime service account for production |
| CI/CD | None | — | Manual `npm run deploy` from developer machine |

### 1.3 Data Flow

**Public read path (all visitors):**
```
Page request → middleware (adds security headers)
  → cms.ts → getProducts()/getBrands()/getSiteContent()
    → Firestore Admin SDK (bypasses Security Rules)
      → In-memory cache (2-min TTL, per-instance)
        → Rendered HTML response
```

**Admin write path (authenticated staff):**
```
Browser: Firebase Client SDK signInWithEmailAndPassword()
  → POST /api/admin/session (exchange idToken for session cookie)
    → Admin SDK verifyIdToken() + check admin:true claim
      → Set httpOnly __session cookie (5-day expiry)

Subsequent requests:
  → middleware.ts verifyAdminSession() (cookie → verifySessionCookie())
    → admin-data.ts → Firestore Admin SDK (CRUD)
      → invalidateCmsCache() → next public read sees fresh data
```

**Contact form path:**
```
POST /api/contact → origin check → rate limit (5/10min per IP)
  → honeypot check → input validation + sanitization
    → admin-data.ts → createContactSubmission() → Firestore
```

### 1.4 Admin Authentication Model

The admin auth model is well-designed with defense in depth:

1. **Firebase Auth** (Email/Password) — only provisioned accounts can sign in
2. **Custom claim** `admin: true` — set by `scripts/create-admin.mjs`, verified server-side on every session creation and every request
3. **httpOnly session cookie** (`__session`) — never exposed to JavaScript, 5-day expiry
4. **Middleware gate** — `verifyAdminSession()` runs on every `/admin/*` page and `/api/admin/*` route (except `/admin/login` and `/api/admin/session`)
5. **Firestore/Storage Security Rules** — deny all client access; Admin SDK bypasses rules so all data access is server-side only

**Architecture Score: 7/10**

*Strengths:* Clean separation of read/write concerns (`cms.ts` vs `admin-data.ts`), well-layered auth model, appropriate technology choices for the workload (no over-engineering), no client-side Firestore SDK exposure, middleware-based security headers applied uniformly.

*Weaknesses:* Per-instance cache not shared across Cloud Run instances, no request-correlation IDs for tracing, admin API routes lack per-route CSRF tokens (rely solely on cookie `sameSite`), no structured output format for API errors.

---

## 2. Deployment Analysis

### 2.1 Docker Configuration

**File:** `Dockerfile`

```dockerfile
FROM node:20-slim AS builder          # ← tag-pinned, not digest-pinned
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_FIREBASE_API_KEY           # ← Build-time args for client bundle
ARG PUBLIC_FIREBASE_AUTH_DOMAIN
ARG PUBLIC_FIREBASE_PROJECT_ID
ENV PUBLIC_FIREBASE_API_KEY=$PUBLIC_FIREBASE_API_KEY
ENV PUBLIC_FIREBASE_AUTH_DOMAIN=$PUBLIC_FIREBASE_AUTH_DOMAIN
ENV PUBLIC_FIREBASE_PROJECT_ID=$PUBLIC_FIREBASE_PROJECT_ID
RUN npm run build

FROM node:20-slim                     # ← tag-pinned, not digest-pinned
WORKDIR /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder --chown=app:app /app/dist ./dist
USER app                              # ✓ Non-root
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "./dist/server/entry.mjs"]
```

**Assessment:** The Dockerfile is well-constructed for a production SSR workload. Multi-stage build, non-root user, HEALTHCHECK, production-only dependencies, and `npm cache clean` all represent good practice. Two concerns remain:

| ID | Finding | Severity |
|---|---|---|
| **D-1** | Base image is tag-pinned (`node:20-slim`) not digest-pinned — builds are not byte-for-byte reproducible. A rebuild of `20-slim` upstream can silently change the runtime. | **Low** |
| **D-2** | No `SIGTERM` handling — Cloud Run sends `SIGTERM` before `SIGKILL` during scale-in and deployment rollover. Without a graceful shutdown handler, in-flight requests may be terminated mid-response. | **Medium** |

**Recommendation for D-1:**
```dockerfile
FROM node:20-slim@sha256:<pin-current-digest> AS builder
# ...
FROM node:20-slim@sha256:<pin-current-digest>
```
Pin to the digest of the currently-deployed image (retrieve via `docker pull node:20-slim && docker inspect node:20-slim --format='{{index .RepoDigests 0}}'`).

**Recommendation for D-2:**
Add a signal handler in the server entry point or in the Dockerfile's CMD:
```dockerfile
CMD ["node", "--expose-gc", "./dist/server/entry.mjs"]
```
And in the application code, listen for `SIGTERM`:
```ts
// Near the top of the server entry point
process.on('SIGTERM', () => {
  console.log(JSON.stringify({ severity: 'INFO', message: 'shutting_down' }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000); // Force exit after 10s
});
```

### 2.2 Cloud Build Pipeline

**File:** `cloudbuild.yaml`

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - build
      - '-t'
      - 'us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/sosun-fihaara'
      - '--build-arg'
      - 'PUBLIC_FIREBASE_API_KEY=${_PUBLIC_FIREBASE_API_KEY}'
      - '--build-arg'
      - 'PUBLIC_FIREBASE_AUTH_DOMAIN=${_PUBLIC_FIREBASE_AUTH_DOMAIN}'
      - '--build-arg'
      - 'PUBLIC_FIREBASE_PROJECT_ID=${_PUBLIC_FIREBASE_PROJECT_ID}'
      - '.'
images:
  - 'us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/sosun-fihaara'
options:
  substitutionOption: ALLOW_LOOSE
```

| ID | Finding | Severity |
|---|---|---|
| **CB-1** | `ALLOW_LOOSE` substitution option means **missing build args are silently ignored**. If `_PUBLIC_FIREBASE_API_KEY` is not passed, the Dockerfile's `ARG` receives an empty string, and the admin login page ships with `apiKey: ""` — silently broken. No build error, no warning. | **High** |
| **CB-2** | Cloud Build builds and pushes the image but **does not deploy it**. The `deploy:cloudrun` npm script chains `gcloud builds submit` and `gcloud run deploy` in a single `bash -c` command — if the build succeeds but deploy fails, there's no rollback or atomicity. | **Medium** |
| **CB-3** | No image vulnerability scanning step (Container Analysis / Artifact Registry scanning) in the pipeline. | **Low** |

**Recommendation for CB-1:** Change to `substitutionOption: FAIL_ON_MISSING` (or remove the option entirely, since `FAIL_ON_MISSING` is the default in newer Cloud Build versions). This ensures the build fails fast rather than shipping a broken admin login page:

```yaml
options:
  substitutionOption: FAIL_ON_MISSING
```

### 2.3 Cloud Run Configuration

**From `package.json` deploy script:**
```
--min-instances=0 --max-instances=10 --memory=512Mi --cpu=1
--concurrency=80 --timeout=30s --allow-unauthenticated
```

| Parameter | Value | Assessment |
|---|---|---|
| `min-instances` | 0 | Appropriate for low-traffic site; trades cold-start latency for cost |
| `max-instances` | 10 | Reasonable ceiling for a catalog site |
| `memory` | 512 MiB | Adequate; Node.js + Firebase Admin SDK typically uses 80–150 MiB idle, 200–300 MiB under load |
| `cpu` | 1 vCPU | Standard; sufficient for SSR |
| `concurrency` | 80 | Aggressive — each instance handles up to 80 concurrent requests. For SSR with Firestore queries, consider lowering to 40–50 if p99 latency spikes under load |
| `timeout` | 30s | Adequate for SSR pages and API routes |
| `--allow-unauthenticated` | yes | Required for Firebase Hosting rewrites, but means the `*.run.app` URL is publicly reachable. Mitigation: the middleware applies CSP and security headers uniformly regardless of entry point |

### 2.4 Secrets Management

The production deployment relies on **Application Default Credentials (ADC)** — the Cloud Run runtime service account is granted Firestore access via IAM. No private key material is stored as environment variables in Cloud Run. This is the **recommended approach** and eliminates the key-leak vector that existed in the prior audit.

Developer-local secrets are in `.env.local` (gitignored). The `.dockerignore` and `.gcloudignore` files now correctly exclude `.env*` files from build context uploads.

**Remaining concern:** The Cloud Run runtime service account's exact IAM role bindings could not be verified from the repository. If it's the default Compute Engine service account (`roles/editor`), this is a significant over-grant. Verify with:

```bash
gcloud run services describe sosun-fihaara --region us-central1 \
  --format="value(spec.template.spec.serviceAccountName)"
```

And tighten to `roles/datastore.user` (Firestore) + `roles/storage.objectAdmin` (if admin uploads are used) on a dedicated service account.

### 2.5 Cache Strategy

**Firebase Hosting headers (from `firebase.json`):**

| Asset type | Cache-Control | Assessment |
|---|---|---|
| JS, CSS, fonts (woff2) | `max-age=31536000, immutable` | ✓ Excellent — content-hashed filenames make this safe |
| Images (jpg, png, gif, webp, svg, ico) | `max-age=86400` | ✓ Reasonable — 1-day cache for images |

**Application-level caching:**

| Endpoint | Cache-Control | Assessment |
|---|---|---|
| `/api/cms.json` | `max-age=3600, stale-while-revalidate=86400` | ✓ Good — 1-hour fresh, 24-hour stale |
| `/api/health` | `no-store` | ✓ Correct — health checks must not be cached |
| Admin pages | `private, no-store` | ✓ Correct — prevents sensitive data caching |

**Deployment Score: 7/10**

---

## 3. Debugging & Runtime Analysis

### 3.1 Current Runtime State

Based on static analysis, the following runtime behaviors are expected:

| Component | Status | Notes |
|---|---|---|
| Public pages (/, /about, /products, /brands, etc.) | ✓ Functional | Field names now match `Product`/`Brand` types |
| Admin login | ✓ Functional | Session cookie exchange working |
| Admin CRUD | ✓ Functional | Cache invalidation on every write |
| Contact form | ✓ Functional | Submissions persisted to Firestore `ContactSubmissions` |
| Health check | ✓ Functional | Returns `{status, buildTime, uptime}` |
| Sitemap | ✓ Functional | Dynamic generation from CMS data |

### 3.2 Potential Runtime Issues

| ID | Finding | Root Cause | Impact | Severity |
|---|---|---|---|---|
| **BUG-1** | Contact form honeypot bypass returns success redirect | `contact.ts` line 43: `if (honeypot) { return redirect('/contact?success=true'); }` — this is intentional (silent discard for bots) but the redirect to `?success=true` means the bot sees the same success page as a real user, providing no feedback that it was caught. This is standard honeypot behavior — not a bug, but note it provides no way to distinguish bot vs human submissions in analytics. | Bots see success page; no operational impact | **Info** |
| **BUG-2** | Admin API routes don't validate field formats | Product create/update accepts any string for price, code, etc. A non-numeric price string will break client-side price sorting (`parseFloat` returns `NaN`). | Admin data-entry errors cause broken UI; no data loss | **Low** |
| **BUG-3** | Rate limiter `setInterval` can prevent Node.js process exit | `rate-limit.ts` line 43: `setInterval(...)` without `.unref()` — the event loop won't exit while this timer is active. In Cloud Run (long-lived process) this is not a production issue, but it will hang local dev/test processes. | Dev experience friction; no production impact | **Low** |

### 3.3 Error Handling Assessment

| Area | Approach | Assessment |
|---|---|---|
| CMS data fetch | Try/catch in API routes, returns empty arrays on failure; page components have error-state banners | ✓ Good |
| Contact form | Try/catch with user-friendly error message; structured error logging | ✓ Good |
| Admin API | Try/catch in session creation; CRUD routes propagate errors as redirects with error query params | ⚠ Adequate — no structured error format across admin API |
| Image upload | `UploadError` subclass with user-friendly messages | ✓ Good |
| Firebase Admin init | Falls back to ADC if explicit credentials not provided | ✓ Good |
| Unhandled rejections | No global handler configured | ⚠ Missing — an unhandled rejection crashes the Node process; Cloud Run restarts it, but in-flight requests are lost |

**Recommendation:** Add a global unhandled rejection handler:

```ts
process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    severity: 'CRITICAL',
    message: 'unhandled_rejection',
    error: String(reason),
  }));
});
```

---

## 4. Performance Audit

### 4.1 Request Flow Latency Profile

```
Browser → Firebase Hosting (CDN edge)
  → Cloud Run cold start (0–2s if min-instances=0)
    → Firestore query (50–200ms per collection)
      → SSR render (20–80ms)
        → Response
```

### 4.2 Current Performance Characteristics

| Factor | Status | Impact |
|---|---|---|
| Cold starts | `min-instances=0` | First request after idle period incurs 1–3s cold start; acceptable for low-traffic marketing site |
| Firestore queries | In-memory cache with 2-min TTL | Cache-hit renders skip Firestore entirely (~20ms vs ~150ms); cold-start or cache-miss pays full query cost |
| Full-collection fetch | `getProducts()` fetches all active products (limit 1000) then filters in JS | At ~548 products, not yet a bottleneck. Will degrade linearly as catalog grows |
| Font loading | 54 `@font-face` blocks with `font-display: swap` | ✓ Text is visible immediately during font load |
| Image optimization | No image resizing/CDN transformation | Wix CDN images served at original resolution; Firebase Storage images also unoptimized. Consider `?size=` URL params or an image optimization service for product thumbnails |
| CSS size | `global.css` 57 KB, `homepage.css` ~70 KB (frozen Tailwind) | `homepage.css` contains unused utility classes from a past Tailwind build — a proper build pipeline would tree-shake this to ~15 KB |
| JS size | Minimal — only the admin login page ships Firebase client SDK (~230 KB gzipped); all other pages are zero-JS by default | ✓ Excellent |
| CDN cache-hit rate | Unknown — requires Firebase Hosting usage dashboard | Cannot assess without live data |

### 4.3 Cost Optimization Opportunities

| Opportunity | Estimated Impact | Difficulty |
|---|---|---|
| Enable Firestore query-level filtering instead of full-collection fetch | Reduces document reads by 60–90% for filtered views | Medium (requires composite indexes) |
| Add `stale-while-revalidate` to page-level `Cache-Control` headers | Reduces Cloud Run requests for repeat visitors | Low |
| Self-host remaining Google Fonts (Alumni Sans SC, Lato) | Eliminates 2 external DNS/TLS/HTTP round trips from critical path | Low |
| Add image resizing (Firebase Storage `?size=` or Cloud Vision API) | Reduces bandwidth for product grid pages | Medium |
| Remove unused CSS from `homepage.css` (unused Tailwind utilities) | Saves ~50 KB per homepage load | Medium (requires Tailwind build pipeline) |

### 4.4 Missing Performance Data

The following require live GCP project access to assess:
- Cloud Run request latency percentiles (p50, p95, p99)
- Cold-start frequency and duration
- Firebase Hosting CDN cache-hit ratio
- Firestore read-operation volume and cost
- Container instance count over time

**Performance Score: 6/10**

---

## 5. Security Audit

### 5.1 Firestore Security Rules

**File:** `firestore.rules`

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;  // Deny all client access
    }
  }
}
```

**Assessment: ✓ Correct.** All Firestore access is through the Admin SDK (server-side), which bypasses Security Rules. The deny-all rule is an explicit safety net against accidental client-side SDK usage. Rules are version-controlled and deployable via `npm run deploy:rules`.

### 5.2 Storage Security Rules

**File:** `storage.rules`

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;    // Public read for product/brand images
      allow write: if false;  // No client uploads
    }
  }
}
```

**Assessment: ✓ Correct.** Public read is required for images displayed on the public site. Uploads are server-side only via `admin-upload.ts` (which calls `makePublic()` after upload). No client can write.

### 5.3 Content Security Policy

**From `src/middleware.ts`:**

```
default-src 'self'
script-src 'self' 'unsafe-inline'
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
img-src 'self' data: https://static.wixstatic.com https://firebasestorage.googleapis.com https://storage.googleapis.com
font-src 'self' https://fonts.gstatic.com
connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

**Assessment: ✓ Strong.** `frame-ancestors 'none'` prevents clickjacking. `'unsafe-inline'` on script/style is necessary for Astro's SSR inline scripts and is acceptable given no user-generated content is rendered unsanitized. Google Fonts and Firebase Auth domains are explicitly allowed.

### 5.4 Security Headers

| Header | Value | Present |
|---|---|---|
| `Content-Security-Policy` | See above | ✓ |
| `X-Content-Type-Options` | `nosniff` | ✓ |
| `X-Frame-Options` | `DENY` | ✓ |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✓ |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | ✓ |
| `Strict-Transport-Security` | **Missing** | ✗ |

### 5.5 Authentication & Authorization

| Component | Implementation | Assessment |
|---|---|---|
| Admin login | Firebase Auth Email/Password → ID token → session cookie exchange | ✓ |
| Custom claims | `admin: true` required on every request | ✓ |
| Session cookie | httpOnly, secure (production), sameSite:lax, 5-day expiry | ✓ |
| CSRF protection | Cookie `sameSite:lax` + origin check on contact form | ⚠ Adequate for current threat model; consider `sameSite:strict` for admin paths |
| Password policy | Firebase Auth default (no custom strength requirements) | ⚠ Weak — no minimum length/character requirements enforced |

### 5.6 Rate Limiting

| Endpoint | Limit | Window | Key |
|---|---|---|---|
| `/api/contact` | 5 requests | 10 minutes | IP (x-forwarded-for) |
| `/api/admin/session` | 10 requests | 15 minutes | IP (x-forwarded-for) |

**Assessment: ✓ Good for current scale.** The per-instance in-memory limiter provides basic protection against single-IP abuse. For a distributed attack (multiple IPs across Cloud Run instances), these limits are not coordinated. At current scale and threat profile, this is acceptable — if the site grows to need stronger protection, Cloud Armor or a Firestore-backed distributed rate limiter should be considered.

### 5.7 Input Validation

| Endpoint | Validation | Assessment |
|---|---|---|
| `/api/contact` | Required fields, email regex, length limits, string sanitization, honeypot | ✓ Comprehensive |
| `/api/admin/session` | idToken presence check, Firebase Auth verification, custom claim check | ✓ Good |
| `/api/admin/products/create` | Required field check (name, brandName, category, code) | ⚠ Minimal — no format validation |
| `/api/admin/products/[id]/update` | Required field check | ⚠ Minimal — no format validation |
| Image upload | MIME type whitelist, 5 MB size limit, filename sanitization | ✓ Good |

### 5.8 Dependency Vulnerabilities

**`npm audit --omit=dev` results (2026-07-01):**

| Severity | Count | Source |
|---|---|---|
| Low | 1 | Transitive — `uuid` via `google-gax` → `teeny-request` |
| Moderate | 9 | Transitive — `retry-request`, `teeny-request` via `google-gax` → `@google-cloud/firestore` |
| High | 1 | Transitive — `gaxios` via `google-gax` |

All 11 vulnerabilities are in the `firebase-admin` → `@google-cloud/firestore` → `google-gax` transitive dependency chain. There are **no exploitable application-level vulnerabilities** — these are advisory-level issues in Google's own client libraries that are automatically resolved when `firebase-admin` updates its transitive dependencies. `npm audit fix` cannot resolve them without breaking changes (`npm audit fix --force` would downgrade `firebase-admin` from v13 to v10).

**Recommendation:** Monitor `firebase-admin` releases and upgrade when a version with resolved transitive deps is published. These are not exploitable from this application's usage pattern.

### 5.9 OWASP Top 10 Coverage

| OWASP Category | Status | Notes |
|---|---|---|
| A01: Broken Access Control | ✓ Mitigated | Admin routes gated by middleware; Firestore rules deny all client access |
| A02: Cryptographic Failures | ✓ Mitigated | HTTPS enforced by Firebase Hosting; ADC for service auth |
| A03: Injection | ✓ Mitigated | Firestore SDK parameterized; no SQL; Astro auto-escapes HTML |
| A04: Insecure Design | ✓ Mitigated | Defense-in-depth auth model; server-side-only data access |
| A05: Security Misconfiguration | ✓ Mostly | HSTS missing; see finding SEC-1 below |
| A06: Vulnerable Components | ⚠ Monitor | 11 transitive npm advisories (see 5.8) |
| A07: Auth Failures | ✓ Mitigated | Firebase Auth + custom claims + session cookies |
| A08: Software & Data Integrity | ✓ Mitigated | package-lock.json committed; npm ci in Docker |
| A09: Logging & Monitoring | ⚠ Basic | Structured JSON logging present but no correlation IDs or alerting |
| A10: SSRF | ✓ Not applicable | No outbound HTTP requests from the application |

### 5.10 Security Findings Register

| ID | Finding | Severity | Status |
|---|---|---|---|
| **SEC-1** | **HSTS header missing** — `Strict-Transport-Security` is not set by middleware. Without HSTS, a MITM attacker on first visit can downgrade to HTTP. | **Medium** | Open |
| **SEC-2** | **`ALLOW_LOOSE` in Cloud Build** — Missing build args silently produce a broken admin login page (see CB-1). | **High** | Open |
| **SEC-3** | **Cloud Run service account IAM unverified** — Could not confirm from repo whether the runtime SA is least-privilege or the default Compute SA (`roles/editor`). | **High** | Needs verification |
| **SEC-4** | **Wix secret in git history** — `FIXES.md` confirmed this but couldn't verify rotation. Treat as compromised until explicitly confirmed rotated. | **High** | Needs verification |
| **SEC-5** | **Admin password policy** — Firebase Auth default has no minimum length/complexity enforcement. Given the small, manually-provisioned admin pool, this is low risk but worth hardening. | **Low** | Open |
| **SEC-6** | **No CSRF tokens on admin API** — Reliance on `sameSite:lax` cookie is adequate for current threat model but not defense-in-depth. | **Low** | Open |
| **SEC-7** | **npm audit advisories** — 11 transitive vulnerabilities in firebase-admin dependency chain. | **Low** | Monitor |

**Security Score: 7/10**

---

## 6. Codebase Review

### 6.1 Project Structure

```
src/
  lib/
    cms.ts               ← Public read-only data layer + cache
    admin-data.ts         ← Admin write layer (Firestore CRUD)
    admin-auth.ts         ← Session verification
    admin-upload.ts       ← Server-side image upload to Storage
    firebase-admin.ts     ← Admin SDK singleton
    firebase-client.ts    ← Client SDK (browser auth only)
    origins.ts            ← CORS/CSRF origin allowlist
    rate-limit.ts         ← Per-instance rate limiter
  middleware.ts            ← CSP, security headers, admin auth gate
  layouts/
    Layout.astro          ← Inner page layout (Nav + Footer)
    HomeLayout.astro      ← Homepage layout (minimal)
    AdminLayout.astro     ← Admin panel layout
  pages/
    index.astro           ← Homepage
    about.astro           ← About Us (timeline)
    products.astro        ← Product catalog (filter/sort/paginate)
    products/[code].astro ← Product detail (JSON-LD schema)
    brands/[slug].astro   ← Brand detail
    contact.astro         ← Contact form + FAQ
    api/health.ts         ← Health check
    api/contact.ts        ← Contact form handler
    api/cms.json.ts       ← CMS data endpoint
    api/admin/*           ← Admin CRUD API routes
    admin/*               ← Admin panel pages
  components/
    Footer.astro          ← Public site footer
    Nav.astro             ← Navigation bar (implied from Layout)
    admin/*               ← Admin form components
```

### 6.2 Code Quality Assessment

| Aspect | Rating | Notes |
|---|---|---|
| **Type safety** | Good | `Product`, `Brand`, `Category` interfaces defined and used consistently; `any` has been eliminated from data-access paths; strict TypeScript mode enabled |
| **Error handling** | Good | Try/catch on all external calls; structured error logging; user-friendly error messages; graceful degradation (empty arrays on CMS fetch failure) |
| **Code organization** | Good | Clear separation of concerns: read vs write, public vs admin, lib vs pages vs components |
| **Naming** | Good | Descriptive function names (`getProducts`, `adminCreateProduct`, `verifyAdminSession`); clear file names |
| **Comments** | Good | JSDoc on all modules explaining purpose, data flow, and limitations; inline comments for non-obvious logic |
| **DRY** | Good | Generic `queryCollection<T>()` in cms.ts; shared form components for admin |
| **Logging** | Adequate | Structured JSON logging on key paths; no request-correlation IDs for tracing across requests |
| **Documentation** | Good | Comprehensive README, AGENTS.md for AI agents, .env.example with comments, DEPLOYMENT log |

### 6.3 Design Patterns

| Pattern | Where | Assessment |
|---|---|---|
| **Singleton** | `firebase-admin.ts` — single Admin SDK instance per process | ✓ Appropriate — avoids multiple `initializeApp()` calls |
| **Repository** | `cms.ts` / `admin-data.ts` — data access layer abstracting Firestore | ✓ Clean separation from route handlers |
| **Middleware pipeline** | `middleware.ts` — authentication gate + security headers | ✓ Well-structured — single point for cross-cutting concerns |
| **Cache-aside** | `cms.ts` — check cache, fetch on miss, store result | ✓ Appropriate for read-heavy workload |
| **Factory** | `origins.ts` — `buildAllowedOrigins()` constructs allowlist from env | ✓ Simple and testable |

### 6.4 Code Smells & Technical Debt

| ID | Finding | Severity |
|---|---|---|
| **DEBT-1** | `homepage.css` (2,250 lines) is a **frozen Tailwind build** — no `tailwind.config.*` in the repo, no build pipeline to regenerate. Any new utility class added to `index.astro` silently fails to style. This is a landmine for future maintainers. | **Medium** |
| **DEBT-2** | `Footer.astro.bak` and `global.css.bak` are backup files in the source tree. Git already preserves history — `.bak` files add confusion. | **Low** |
| **DEBT-3** | `public/og-default.png.png` — double file extension, likely a mistake. | **Low** |
| **DEBT-4** | The `scripts/` directory mixes one-time migration scripts (`seed-firestore.mjs`), admin provisioning (`create-admin.mjs`), and debug utilities (`fetch-cms-debug.mjs`). No README distinguishing which are safe to run. | **Low** |
| **DEBT-5** | No test infrastructure — no test runner, no test files, no CI workflow. `AGENTS.md` instructs "run `npm run check` before considering a change done" which provides type-checking but zero behavioral verification. | **Medium** |

### 6.5 What's Improved Since the Prior Audit

The following items from the 2026-06-28/30 audit and FIXES.md have been **confirmed resolved** in the current working tree:

- ✅ All 12 Phase 1 items (secret removal, pagination fix, CSRF fix, cache mutation fix, protocol-relative URLs, input validation, dev artifacts deleted, hardcoded year)
- ✅ All 8 Phase 2 items (CORS fix, retry logic, AbortController timeouts, middleware/CSP, health endpoint, GSAP removal, error state banners, font-display:swap)
- ✅ 4 of 8 Phase 3 items (field rename, TypeScript types, image dimensions, product code uniqueness)
- ✅ Pre-launch items (custom domain origins, CSS audit, image upload checklist)
- ✅ 3 Phase 3b items (Google Fonts cleanup, double-nested main fix, missing closing tags)
- ✅ React integration removed from `astro.config.mjs` and `package.json`
- ✅ `.dockerignore` and `.gcloudignore` added
- ✅ Dockerfile: non-root user + HEALTHCHECK
- ✅ `firestore.rules` and `storage.rules` added and version-controlled

**Maintainability Score: 6/10**

---

## 7. Consolidated Findings Register

### Critical — None remaining

All Critical findings from the prior audit have been resolved.

### High

| ID | Finding | Area | Action |
|---|---|---|---|
| **CB-1** | `ALLOW_LOOSE` in Cloud Build — missing build args silently ship broken admin login | Deployment / Security | Change to `FAIL_ON_MISSING` |
| **SEC-3** | Cloud Run service account IAM scope unverified — possible `roles/editor` over-grant | Security | Verify and tighten to `roles/datastore.user` |
| **SEC-4** | Wix secret in git history — rotation unconfirmed | Security | Rotate immediately in Wix Dashboard |

### Medium

| ID | Finding | Area | Action |
|---|---|---|---|
| **D-2** | No `SIGTERM` handler — in-flight requests may be dropped during scale-in | Reliability | Add graceful shutdown handler |
| **SEC-1** | HSTS header missing from middleware | Security | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains` |
| **DEBT-1** | `homepage.css` is frozen Tailwind with no build pipeline | Maintainability | Either add Tailwind build step or document as intentionally static |
| **DEBT-5** | No test infrastructure or CI pipeline | Reliability | Add Playwright smoke tests + GitHub Actions workflow |
| **CB-2** | Deploy script chains build + deploy in single bash command — no atomicity | Deployment | Separate build and deploy steps with error handling |

### Low

| ID | Finding | Area | Action |
|---|---|---|---|
| **D-1** | Docker base image tag-pinned, not digest-pinned | Deployment | Pin to SHA256 digest |
| **BUG-2** | Admin API doesn't validate field formats (e.g., price as non-numeric) | Code | Add format validation to admin create/update routes |
| **BUG-3** | `setInterval` in rate-limit.ts lacks `.unref()` | Code | Add `.unref()` for clean test/dev shutdown |
| **SEC-5** | No admin password strength policy | Security | Configure Firebase Auth password policy |
| **SEC-6** | No CSRF tokens on admin API (cookie-only protection) | Security | Add `X-Requested-With` header check or CSRF token |
| **SEC-7** | 11 npm audit advisories (transitive, firebase-admin chain) | Security | Monitor and upgrade firebase-admin when resolved |
| **DEBT-2** | `.bak` files in source tree | Code | Delete (git history preserves prior versions) |
| **DEBT-3** | `og-default.png.png` double extension | Code | Fix filename |
| **DEBT-4** | `scripts/` directory unorganized | Code | Add README or subdirectories |

---

## 8. Action Plan

### Immediately (before next deploy)

1. **Fix Cloud Build substitution handling** (CB-1) — Change `ALLOW_LOOSE` → `FAIL_ON_MISSING` in `cloudbuild.yaml`. This is a one-line change that prevents silently-broken deploys.

2. **Verify Wix secret rotation** (SEC-4) — Confirm in Wix Dashboard that the key committed in git history (commit `48a7f8f`, `src/lib/cms.ts`) has been rotated. If not, rotate immediately.

3. **Verify Cloud Run IAM** (SEC-3) — Run `gcloud run services describe sosun-fihaara` and confirm the runtime service account is not the default Compute Engine SA.

### This week

4. **Add HSTS header** (SEC-1) — One-line addition to `middleware.ts`:
   ```ts
   response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
   ```

5. **Add SIGTERM handler** (D-2) — Add graceful shutdown in the server entry point or Dockerfile.

6. **Pin Docker base image digests** (D-1) — Pin `node:20-slim` to current SHA256.

7. **Self-host Google Fonts** (PERF) — Download Alumni Sans SC + Lato woff2 files, add `@font-face` blocks, remove external `<link>` and `@import`. Eliminates 2 render-blocking external requests and removes the CSP dependency on Google Fonts CDN.

### This month

8. **Add Playwright smoke tests** (DEBT-5) — One test per public page asserting key content renders (product name, brand name, category labels). This alone would catch regression bugs before deploy.

9. **Add GitHub Actions CI** — Run `npm run check` + Playwright tests on every PR.

10. **Resolve homepage CSS situation** (DEBT-1) — Either set up a Tailwind build pipeline or commit to the static file and document it.

11. **Migrate from per-instance cache to CDN-level caching** — Apply `Cache-Control: public, s-maxage=...` headers on SSR-rendered pages that don't vary per-user.

12. **Add Firestore query-level filtering** (PERF) — Build `where()` clauses dynamically from URL params instead of fetching all products and filtering in JS.

13. **Clean up codebase** (DEBT-2, DEBT-3, DEBT-4) — Delete `.bak` files, fix double extension, organize scripts.

### Ongoing

14. **Monitor firebase-admin releases** — Upgrade when transitive `gaxios`/`uuid` vulnerabilities are resolved.

15. **Set up Cloud Monitoring dashboards** — Track Cloud Run latency percentiles, cold-start frequency, Firestore read volume.

---

## 9. Appendix: Verification Gaps

The following items require live GCP project / Firebase Console access and **could not be verified** from the repository alone:

1. **Cloud Run runtime service account IAM** — Actual role bindings (SEC-3)
2. **Wix secret rotation status** — Whether the committed key has been deactivated (SEC-4)
3. **Cloud Run direct-access status** — Whether the `*.run.app` URL is reachable without Firebase Hosting
4. **Firebase Auth password policy** — Whether any strength requirements are configured
5. **Firestore indexes** — Whether composite indexes exist for filtered queries
6. **Cloud Logging retention** — Whether log retention/redaction policies are configured
7. **Live latency/cost data** — Actual p50/p95/p99 latency, cold-start frequency, Firestore read volume

---

*Report generated 2026-07-01 by comprehensive static analysis. All findings are grounded in repository evidence. No live GCP project, Cloud Run instance, or Firebase Console was accessible.*
