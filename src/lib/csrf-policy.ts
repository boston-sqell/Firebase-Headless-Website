/**
 * Which requests get which CSRF defense. Kept as pure functions so the
 * middleware's routing decisions are unit-testable (see
 * tests/unit/csrf-policy.test.ts — regression coverage for the
 * "first login 403s" defect).
 *
 * Two tiers:
 *
 *  1. Authenticated admin API routes → session-derived CSRF token
 *     (csrf.ts). The token is SHA-256 of the __session cookie, so it can
 *     only exist once a session exists.
 *
 *  2. The login endpoint itself (POST /api/admin/session) → Origin
 *     allowlist check ONLY. It must NOT require the CSRF token: the token
 *     is derived from the session cookie, which cannot exist before login,
 *     so gating login on it would 403 every fresh browser. Login-CSRF is
 *     instead prevented by the Origin check plus the fact that the request
 *     must carry a valid Firebase idToken an attacker cannot forge.
 */

export const SESSION_ENDPOINT = '/api/admin/session';

export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Mutating admin API requests that must present the session-derived CSRF token. */
export function requiresCsrfToken(pathname: string, method: string): boolean {
  return (
    pathname.startsWith('/api/admin') &&
    pathname !== SESSION_ENDPOINT &&
    MUTATING_METHODS.has(method)
  );
}

/** Login/logout requests that must pass the Origin allowlist check instead. */
export function requiresLoginOriginCheck(pathname: string, method: string): boolean {
  return pathname === SESSION_ENDPOINT && MUTATING_METHODS.has(method);
}
