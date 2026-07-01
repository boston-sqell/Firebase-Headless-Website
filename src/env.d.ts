/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    adminUid?: string;
    adminEmail?: string;
    /** Double-submit CSRF token for the current request; see src/lib/csrf.ts. */
    csrfToken: string;
  }
}
