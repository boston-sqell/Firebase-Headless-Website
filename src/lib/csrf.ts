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
 * as a `csrf_token` form field (plain HTML forms), a `csrfToken` JSON
 * body field, or an `x-csrf-token` header (fetch-based calls from
 * AdminLayout's form-intercept script).
 *
 * NOTE on body parsing: request.clone().formData() can throw in the
 * Astro 7 + @astrojs/node environment due to Node.js stream handling
 * differences. The catch block therefore falls through to the header
 * check instead of returning null -- the AdminLayout script ensures
 * every admin form submission also sends x-csrf-token as a header,
 * making that path the reliable primary route for HTML forms.
 */

import type { AstroCookies } from "astro";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE_NAME } from "./admin-auth";

/**
 * Returns the current CSRF token.
 * 
 * Firebase Hosting strips all cookies except `__session` to maximize CDN
 * cache hit rates. Therefore, we cannot use a standard double-submit cookie
 * approach with a separate `csrf_token` cookie.
 * 
 * Instead, we derive the CSRF token deterministically from the HttpOnly 
 * `__session` cookie itself via a SHA256 hash. Since the session cookie is
 * inaccessible to client-side JS (HttpOnly) and possesses high entropy,
 * an attacker cannot compute the expected CSRF token to forge a request.
 * The server computes it and embeds it into the HTML, which the legitimate
 * JS reads and submits.
 */
export function ensureCsrfToken(cookies: AstroCookies, secure: boolean): string {
  const session = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    // If there's no session yet (e.g. on the login page), we just generate a random
    // token. The login endpoint itself doesn't check CSRF, so this is fine.
    return randomBytes(32).toString("hex");
  }

  // Derive the CSRF token from the session cookie
  return createHash("sha256").update(session).digest("hex");
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
 * body for the downstream handler. Checks sources in priority order:
 *
 *  1. `x-csrf-token` request header  ← most reliable; AdminLayout's JS always
 *     sends this for every form submission, so body parsing is a fallback only.
 *  2. JSON body `csrfToken` field     ← login page fetch call
 *  3. multipart / URL-encoded body `csrf_token` field ← HTML form fallback
 *
 * The body paths use request.clone() so the original body stream is intact
 * for the downstream API route. If cloning/parsing throws, we log the error
 * and return null (the header path will have already succeeded for normal
 * admin-panel use).
 */
export async function extractSubmittedCsrfToken(request: Request): Promise<string | null> {
  // ── 1. Header (most reliable -- sent by AdminLayout's JS form interceptor) ──
  const headerToken = request.headers.get("x-csrf-token");
  if (headerToken) return headerToken;

  // ── 2. Body (fallback for environments where JS is unavailable) ──────────────
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
  } catch (err) {
    // Log so Cloud Run surfaces the underlying parse error -- this is the
    // diagnostic path, not the happy path (header above should have fired).
    console.warn(JSON.stringify({
      severity: "WARNING",
      message: "csrf_body_parse_failed",
      contentType,
      error: String(err),
    }));
  }

  return null;
}

/** True if the request's submitted token matches the expected token derived from the session. */
export async function verifyCsrf(request: Request, cookies: AstroCookies): Promise<boolean> {
  const session = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    console.warn(JSON.stringify({
      severity: "WARNING",
      message: "csrf_session_missing",
    }));
    return false;
  }

  const expectedToken = createHash("sha256").update(session).digest("hex");
  const submitted = await extractSubmittedCsrfToken(request);

  if (!submitted) {
    console.warn(JSON.stringify({
      severity: "WARNING",
      message: "csrf_submitted_token_missing",
    }));
    return false;
  }

  const matches = tokensMatch(expectedToken, submitted);
  if (!matches) {
    console.warn(JSON.stringify({
      severity: "WARNING",
      message: "csrf_token_mismatch",
      expectedPrefix: expectedToken.slice(0, 6),
      submittedPrefix: submitted.slice(0, 6),
      expectedLength: expectedToken.length,
      submittedLength: submitted.length,
    }));
  }
  return matches;
}
