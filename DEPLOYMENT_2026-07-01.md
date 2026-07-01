# Deployment Session — 2026-07-01

Summary of the pre-launch setup and production deployment of the Sosun Fihaara admin panel and public site.

## What was done

1. **Pre-launch setup**
   - Enabled Email/Password sign-in in Firebase Console.
   - Filled in missing `.env.local` values (`FIREBASE_STORAGE_BUCKET`, `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`).
   - Created the first admin account via `scripts/create-admin.mjs` for `boston.sqelll@gmail.com`.

2. **Production deployment**
   - Deployed Firestore security rules.
   - Deployed Storage security rules (required registering a storage deploy target in `.firebaserc` and switching `firebase.json` to the target-based array syntax for this firebase-tools version).
   - Initialized the Firebase Storage default bucket (never previously set up on this project).
   - Granted the deploying service account the **Editor** and **Firebase Admin** IAM roles (previously scoped too narrowly for deploy operations).
   - Deployed Firebase Hosting.
   - Built and deployed the Cloud Run service (`sosun-fihaara`, `us-central1`).

## Bugs found and fixed during verification

### 1. Admin login script broken by `define:vars`
`src/pages/admin/login.astro` used `<script define:vars={{ safeNext }}>`, which forces Astro to treat the script as `is:inline` and skip module processing. This broke the `import` statements inside it, so the login form silently fell back to a plain HTML GET submission — exposing the email/password as URL query parameters instead of posting to `/api/admin/session`.

**Fix:** moved `safeNext` out of `define:vars` into a `data-next` attribute on the form, read via `form.dataset.next` inside a normal (properly bundled) `<script>` tag.

### 2. Public Firebase config never reached the Cloud Run build
`.gcloudignore` correctly excludes `.env.local` from the source uploaded to Cloud Build, but the `Dockerfile`'s `RUN npm run build` step had no other path to receive `PUBLIC_FIREBASE_API_KEY` / `PUBLIC_FIREBASE_AUTH_DOMAIN` / `PUBLIC_FIREBASE_PROJECT_ID`. Every Cloud Run deploy was baking an empty API key into the client bundle, so sign-in always failed with `auth/invalid-api-key` in production — independent of bug #1 above.

**Fix (permanent, not just a one-off patch):**
- `Dockerfile` — added `ARG`/`ENV` declarations for the three public values in the builder stage, before `RUN npm run build`.
- `cloudbuild.yaml` (new) — explicit build step that passes those values in via `--build-arg`, sourced from Cloud Build substitutions.
- `package.json` — `deploy:cloudrun` now sources `.env.local` and forwards the three values as substitutions automatically, so `npm run deploy` works end-to-end without manual steps.

### 3. Incidental file-corruption during editing
Both `Dockerfile` and `package.json` were silently truncated mid-write at one point during this session (a filesystem quirk in the environment, not a code issue). Caught by verifying file contents directly via shell (`wc -l`, `cat`) rather than trusting the editor view, and repaired with direct rewrites.

## Verification

Signed in at `/admin/login` with the production admin account in a live browser session:
- `POST /api/admin/session` → `200`
- Redirected to `/admin` → Dashboard rendered with real data (548 products, 21 brands, 4 categories).

## Live URLs

- Primary: https://website-c3acf.web.app
- Cloud Run (direct): https://sosun-fihaara-921041459266.us-central1.run.app
- Current Cloud Run revision: `sosun-fihaara-00012-b64` (100% traffic)

## Notes for next time

- `npm run deploy` (or `npm run deploy:cloudrun` alone) will now correctly bake in the public Firebase config — no manual `--build-arg` steps needed.
- Admin accounts are created only via `node scripts/create-admin.mjs <email> <password>` — there is no public sign-up.
