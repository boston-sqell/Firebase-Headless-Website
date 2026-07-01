/**
 * CSRF protection for the admin panel, as defense-in-depth on top of the
 * session cookie's SameSite=Lax attribute (see admin-auth.ts / session.ts).
 *
 * SameSite=Lax already blocks the classic case (a cross-site auto-submitting
 * form can't get the session cookie attached to its POST), but tokens are
 * added anyway in case that assumption is ever weakened -- a browser bug,
 * a future relaxation of the cookie policy, a subdomain running attacker
 * content, etc.
 *
 * Pattern: double-submit cookie. A random token is stored in an httpOnly
 * cookie (readable server-side for rendering into pages, not by page JS)
 * and must be echoed back by the client on every mutating request, either
 * as a `csrf_token` form field (plain HTML forms) or a `csrfToken` JSON
 * body field / `x-csrf-token` header (fetch-based calls). Since an
 * attacker's page can't read our cookie (browsers enforce same-origin for
 * cookie access) it can't produce a request carrying a matching token.
 */

import type { AstroCookies } from "astro";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_COOKIE_NAME = "csrf_token";

/**
 * Returns the current CSRF token, creating and setting the cookie on first
 * visit if none exists yet. Call this on every request (see middleware.ts)
 * so every rendered page has a token available to embed in its forms.
 */
export function ensureCsrfToken(cookies: AstroCookies, secure: boolean): string {
  const existing = cookies.get(CSRF_COOKIE_NAME)?.value;
  if (existing) return existing;

  const token = randomBytes(32).toString("hex");
  cookies.set(CSRF_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "lax",
    // No maxAge -- session cookie, regenerated per browser session. Keeping
    // it short-lived like this means a stolen/logged token is only useful
    // for as long as that browser session lasts.
  });
  return token;
}

/** Constant-time comparison so this check isn't itself a timing oracle. */
function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extracts the submitted CSRF token from a request without consuming its
 * body for the downstream handler -- clones the request first, since
 * Request bodies can only be read once. Supports both the plain HTML
 * form-post shape (`csrf_token` field, used by every admin form) and a
 * JSON-body shape (`csrfToken` field, used by the login page's fetch call).
 */
export async function extractSubmittedCsrfToken(request: Request): Promise<string | null> {
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.clone().json();
      return typeof body?.csrfToken === "string" ? body.csrfToken : null;
    }
    if (
      contentType.includes("multipart/form-data") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      const formData = await request.clone().formData();
      const value = formData.get("csrf_token");
      return typeof value === "string" ? value : null;
    }
  } catch {
    return null;
  }

  // Fall back to a header, for any future JS-driven call that doesn't fit
  // the two shapes above.
  return request.headers.get("x-csrf-token");
}

/** True if the request's submitted token matches the cookie's token. */
export async function verifyCsrf(request: Request, cookies: AstroCookies): Promise<boolean> {
  const cookieToken = cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) return false;

  const submitted = await extractSubmittedCsrfToken(request);
  if (!submitted) return false;

  return tokensMatch(cookieToken, submitted);
}
