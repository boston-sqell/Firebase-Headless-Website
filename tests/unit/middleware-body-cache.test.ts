/**
 * End-to-end tests for the middleware CSRF check + downstream API handler body access.
 *
 * These tests verify that:
 *   1. The CSRF check passes when the correct token is present (cookie + form field).
 *   2. The API route handler can still read ALL form fields after the CSRF check ran —
 *      i.e. extractSubmittedCsrfToken's request.clone() approach leaves the original
 *      body stream intact.
 *   3. CSRF check correctly rejects missing cookie and missing form token.
 *
 * No Object.defineProperty hack is needed with the fix applied to csrf.ts.
 */
import { describe, it, expect } from 'vitest';
import { verifyCsrf, ensureCsrfToken } from '../../src/lib/csrf';
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

describe('middleware CSRF check + downstream body access (no Object.defineProperty)', () => {
  it('CSRF check passes and the original request body is still readable by the API handler', async () => {
    const { cookies } = makeFakeCookies();
    const token = ensureCsrfToken(cookies, false);

    const formData = new FormData();
    formData.set('csrf_token', token);
    formData.set('heroTagline', 'Est. 1980');
    formData.set('heroSubtext', 'Four decades of trust');
    formData.set('aboutHeading', 'BUILT ON TRUST');
    formData.set('aboutSubtext', 'Backbone of FMCG distribution');

    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: formData,
    });

    // Middleware step: CSRF check (extractSubmittedCsrfToken clones internally — no patch needed)
    const csrfOk = await verifyCsrf(request, cookies);
    expect(csrfOk).toBe(true);

    // API route handler step: should still be able to read the original body
    const apiFormData = await request.formData();
    expect(apiFormData.get('heroTagline')).toBe('Est. 1980');
    expect(apiFormData.get('heroSubtext')).toBe('Four decades of trust');
    expect(apiFormData.get('aboutHeading')).toBe('BUILT ON TRUST');
    expect(apiFormData.get('aboutSubtext')).toBe('Backbone of FMCG distribution');
  });

  it('CSRF check fails when cookie is absent', async () => {
    const { cookies } = makeFakeCookies(); // no csrf_token cookie
    const formData = new FormData();
    formData.set('csrf_token', 'any-token-value');

    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: formData,
    });

    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('CSRF check fails when form token is absent', async () => {
    const { cookies } = makeFakeCookies();
    ensureCsrfToken(cookies, false); // cookie is set, but no matching form field
    const formData = new FormData();
    formData.set('heroTagline', 'no csrf token here');

    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: formData,
    });

    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('URL-encoded form (delete action) works correctly', async () => {
    const { cookies } = makeFakeCookies();
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
