# Sosun Fihaara -- Website + Admin Panel

A server-rendered marketing and product-catalog website for Sosun Fihaara, an FMCG wholesale/retail distributor in the Maldives, plus a staff admin panel for managing products, brands, categories, homepage content, and contact-form enquiries -- all without touching code.

**Stack:** Astro 5 (SSR) -> Cloud Run -> Firebase Hosting (edge) -> Firestore (data) -> Firebase Storage (images) -> Firebase Auth (staff login only).

This project was originally migrated from a Wix-hosted site. That migration is fully complete: all images are hosted on Firebase Storage, all Wix code and tooling has been removed, and a Firestore scan on 2026-07-02 confirmed zero remaining Wix references. The application is purely Astro + Firebase + Cloud Run.

---

## Architecture at a glance

```
Browser
  -> Firebase Hosting (static assets, wildcard rewrite)
    -> Cloud Run "sosun-fihaara" (Astro Node SSR)
      -> src/middleware.ts (security headers + /admin session check)
        -> public pages (src/lib/cms.ts, read-only, Admin SDK)
        -> admin panel (src/lib/admin-data.ts, read/write, Admin SDK)
          -> Firestore (Products, Brands, Categories, SiteContent, ContactSubmissions)
          -> Firebase Storage (uploaded images)
```

The browser never talks to Firestore or Storage directly -- every read and write happens server-side through the Firebase Admin SDK. Firebase Auth is used only to authenticate staff into `/admin`; after login, a secure session cookie (not the Firebase ID token) is what the browser holds. See `firestore.rules` / `storage.rules` for why they can safely deny all client access.

---

## First-time setup

### 1. Create a Firebase project (if you don't have one)

1. console.firebase.google.com -> **Add project**
2. Enable **Firestore Database** (production mode is fine -- rules are managed via `firestore.rules` in this repo, not the console)
3. Enable **Storage**
4. **Project Settings -> Service Accounts -> Generate new private key** -- download the JSON, you'll need three values from it below
5. **Project Settings -> General -> Your apps -> Add app -> Web** -- register a web app, you'll need three more values from its config

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

| Variable | Where to find it |
|---|---|
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | The service account JSON from step 1.4 |
| `FIREBASE_STORAGE_BUCKET` | Firebase Console -> Storage -> the bucket name shown there |
| `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID` | The web app config from step 1.5 |
| `PUBLIC_SITE_URL` | Your production domain, e.g. `https://sosunfihaara.com` |

Also update `.firebaserc` if you're pointing at a different Firebase project than `website-c3acf`.

### 3. Enable Email/Password sign-in

Firebase Console -> **Authentication -> Sign-in method -> Email/Password -> Enable**. This is the only sign-in method the admin panel uses, and there is no public sign-up -- accounts are created with the script below.

### 4. Install dependencies

```bash
npm install
```

### 5. Create your first admin account

```bash
node scripts/create-admin.mjs "you@sosunfihaara.com" "a-strong-password"
```

Run this again any time to add another staff member or reset a password. It also grants the `admin` custom claim, which is checked on every request -- a Firebase Auth account without it cannot get past `/admin/login`.

### 6. (Optional) Seed initial catalog data

Add your first products/brands directly through `/admin`. (The one-time Wix import script has been removed; it remains available in git history if ever needed.)

### 7. Run locally

```bash
npm run dev
```

Visit `http://localhost:4322` for the public site and `http://localhost:4322/admin` for the admin panel.

---

## Using the admin panel

Sign in at `/admin/login` with an account created via `scripts/create-admin.mjs`. From there:

- **Products** -- create/edit/delete, upload a product image, set price, pack size, category, and visibility.
- **Brands** -- create/edit/delete, upload a logo and brand-page hero image.
- **Categories** -- control the sidebar order shown on `/products`.
- **Site Content** -- edit the homepage hero heading/tagline/image, the "Built on Trust" section, and the Brands page hero image.
- **Messages** -- every contact-form submission lands here (nothing is emailed out by default -- see "Known limitations" below).

Changes appear on the public site within moments -- admin writes invalidate the site's cache immediately rather than waiting out its TTL.

---

## Deploying

```bash
npm run deploy
```

This runs, in order:
1. `firebase deploy --only firestore:rules,storage:rules` -- deploys `firestore.rules` / `storage.rules`
2. `firebase deploy --only hosting` -- deploys the static client assets + Hosting config
3. `gcloud builds submit` + `gcloud run deploy` -- builds the Docker image and deploys the SSR server to Cloud Run

**Before your first deploy**, review the `deploy:cloudrun` script in `package.json` -- it sets `--min-instances=0 --max-instances=10 --memory=512Mi --cpu=1 --concurrency=80`, which is a reasonable starting point but not tuned to your actual traffic. Also confirm the Cloud Run service's runtime service account has only the IAM roles it needs (`roles/datastore.user` for Firestore, Storage Object Admin scoped to the one bucket) rather than the default Compute Engine service account, which is usually over-privileged.

In production, you can omit `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` entirely and let Cloud Run's Application Default Credentials handle authentication via its runtime service account -- no private key to manage or leak. Keep them only for local development, in `.env.local`, which is git-ignored.

---

## Security model (read this before adding features)

- **No public sign-up.** The only way to create an admin account is `scripts/create-admin.mjs`, run by someone with server access. Every account carries a custom claim (`admin: true`) that's checked on both login and every subsequent request.
- **Firestore/Storage rules deny all client access.** All data access goes through server-side API routes gated by `src/middleware.ts`. If you ever add a feature that needs the browser to talk to Firestore/Storage directly, write a narrow rule for that exact case -- don't loosen the blanket deny.
- **Rate limiting is best-effort.** `src/lib/rate-limit.ts` throttles per Cloud Run instance, not globally. It reduces casual abuse of `/api/contact` and `/admin/login` but is not a substitute for Cloud Armor or Firebase App Check if this ever needs to withstand a real distributed attack.
- **Never commit `.env.local`.** It's git-ignored and excluded from the Docker/Cloud Build context via `.dockerignore`/`.gcloudignore` -- keep both files in sync if you add new local-only files.

---

## Known limitations / deliberately deferred work

- **Contact form has no outbound email.** Submissions are stored in Firestore and visible in `/admin/messages`; nothing is emailed to staff. Wiring up SendGrid/Resend for a notification email is a small, isolated addition to `src/pages/api/contact.ts` if you want it later.
- **Cache is per-Cloud-Run-instance.** `src/lib/cms.ts` keeps a short-lived in-memory cache to absorb request bursts; it is not shared across instances and is cleared on every admin write. Fine at current traffic/catalog size; if the catalog or traffic grows significantly, consider moving product filtering to Firestore query constraints instead of fetching the full collection.
- **`npm audit` reports transitive advisories** in `firebase-admin`'s dependency chain (`@google-cloud/firestore` -> `google-gax` -> `gaxios`/`uuid`). No non-breaking fix is available upstream as of this writing; monitor for a patched release rather than force-downgrading `firebase-admin` (npm's suggested fix would downgrade it to a much older major version).
