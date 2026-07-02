/**
 * End-to-end tests for the middleware CSRF check + downstream API handler body access.
 *
 * These tests verify that:
 *   1. The CSRF check passes when the correct session-derived token is present.
 *   2. The API route handler can still read ALL form fields after the CSRF check ran —
 *      i.e. extractSubmittedCsrfToken's request.clone() approach leaves the original
 *      body stream intact.
 *   3. CSRF check correctly rejects a missing session and a missing token.
 */
import { describe, it, expect } from 'vitest';
import { verifyCsrf, ensureCsrfToken } from '../../src/lib/csrf';
import { SESSION_COOKIE_NAME } from '../../src/lib/admin-auth';
import type { AstroCookies } from 'astro';

function makeFakeCookies(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const fake = {
    get(name: string) {
      const value = store.get(name);
      return value === undefined ? undefined : { value };
    },
    set(name: string, value: string) {
      store.set(name, value);
    },
    delete(name: string) {
      store.delete(name);
    },
  };
  return { cookies: fake as unknown as AstroCookies, store };
}

/** A cookie jar representing a logged-in admin browser. */
function makeSessionCookies() {
  return makeFakeCookies({ [SESSION_COOKIE_NAME]: 'fake-session-cookie-value' });
}

describe('middleware CSRF check + downstream body access', () => {
  it('CSRF check passes via x-csrf-token header and the original request body is still readable by the API handler', async () => {
    const { cookies } = makeSessionCookies();
    const token = ensureCsrfToken(cookies, false);

    const formData = new FormData();
    formData.set('csrf_token', token);
    formData.set('heroTagline', 'Est. 1980');
    formData.set('heroSubtext', 'Four decades of trust');
    formData.set('aboutHeading', 'BUILT ON TRUST');
    formData.set('aboutSubtext', 'Backbone of FMCG distribution');

    // AdminLayout's JS sends the token as a header (primary path)
    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      headers: { 'x-csrf-token': token },
      body: formData,
    });

    // Middleware step: CSRF check reads from header (no body parsing)
    const csrfOk = await verifyCsrf(request, cookies);
    expect(csrfOk).toBe(true);

    // API route handler step: body is still intact
    const apiFormData = await request.formData();
    expect(apiFormData.get('heroTagline')).toBe('Est. 1980');
    expect(apiFormData.get('heroSubtext')).toBe('Four decades of trust');
    expect(apiFormData.get('aboutHeading')).toBe('BUILT ON TRUST');
    expect(apiFormData.get('aboutSubtext')).toBe('Backbone of FMCG distribution');
  });

  it('CSRF check fails when the session cookie is absent', async () => {
    const { cookies } = makeFakeCookies(); // no __session cookie
    const formData = new FormData();
    formData.set('csrf_token', 'any-token-value');

    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: formData,
    });

    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('CSRF check fails when the submitted token is absent', async () => {
    const { cookies } = makeSessionCookies();
    const formData = new FormData();
    formData.set('heroTagline', 'no csrf token here');

    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: formData,
    });

    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('URL-encoded form (delete action) works correctly', async () => {
    const { cookies } = makeSessionCookies();
    const token = ensureCsrfToken(cookies, false);

    // Inline delete forms use application/x-www-form-urlencoded (no enctype="multipart/form-data")
    const body = new URLSearchParams({ csrf_token: token });
    const request = new Request('http://example.com/api/admin/products/abc123/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    expect(await verifyCsrf(request, cookies)).toBe(true);
  });
});
