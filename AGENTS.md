# Agent notes for this repository

This is an Astro 5 SSR site (Cloud Run + Firebase Hosting + Firestore + Firebase Storage + Firebase Auth), not a Wix project -- the `@wix/*` CLI/packages referenced by earlier versions of this file have been removed and no longer apply.

See `README.md` for full setup, architecture, and deployment instructions. Key things to know before making changes:

- **Data layer split:** `src/lib/cms.ts` is read-only (public pages). `src/lib/admin-data.ts` is read/write and must only ever be called from code already gated behind `src/lib/admin-auth.ts` (i.e. `/admin/*` pages and `/api/admin/*` routes, enforced in `src/middleware.ts`). Don't import `admin-data.ts` from a public page.
- **Product/Brand/Category field names** are `name`, `brandName`, `category`, `subcategory`, `price`, `packSize`, `image`, `code`, `slug` -- always import the `Product`/`Brand`/`Category` types from `src/lib/cms.ts` rather than typing CMS data as `any`. A previous field-name mismatch between the data layer and two page templates (products.astro, brands/[slug].astro) silently broke the product catalog for a while -- strict typing is what catches this class of bug at `npm run check` time instead of at runtime.
- **No client-side Firestore/Storage access anywhere.** `firestore.rules` and `storage.rules` deny all client access by design. If a feature seems to need client-side Firestore, prefer adding a server-side API route instead.
- **Admin accounts** are provisioned only via `scripts/create-admin.mjs` -- there's no sign-up flow, and it should stay that way.
- Run `npm run check` (Astro + TypeScript check) before considering a change done.
