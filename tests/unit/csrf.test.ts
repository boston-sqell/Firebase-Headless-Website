import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { ensureCsrfToken, verifyCsrf, extractSubmittedCsrfToken } from '../../src/lib/csrf';
import { SESSION_COOKIE_NAME } from '../../src/lib/admin-auth';
import type { AstroCookies } from 'astro';

/**
 * Minimal in-memory stand-in for Astro's cookie jar -- just enough of the
 * interface (get/set/delete) for csrf.ts to work against, so these tests
 * don't need a running Astro server.
 *
 * NOTE: the CSRF design is session-derived (Firebase Hosting strips all
 * cookies except __session, so a separate double-submit cookie is not
 * possible). The token is SHA-256(__session cookie value); no CSRF cookie
 * is ever set.
 */
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

const SESSION_VALUE = 'test-session-cookie-value-with-high-entropy';
const EXPECTED_TOKEN = createHash('sha256').update(SESSION_VALUE).digest('hex');

describe('ensureCsrfToken (session-derived)', () => {
  it('derives the token deterministically from the __session cookie', () => {
    const { cookies } = makeFakeCookies({ [SESSION_COOKIE_NAME]: SESSION_VALUE });
    expect(ensureCsrfToken(cookies, true)).toBe(EXPECTED_TOKEN);
    expect(ensureCsrfToken(cookies, true)).toBe(EXPECTED_TOKEN); // stable
  });

  it('returns a random throwaway token when no session exists (login page)', () => {
    const { cookies, store } = makeFakeCookies();
    const first = ensureCsrfToken(cookies, true);
    const second = ensureCsrfToken(cookies, true);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first); // random, not persisted
    expect(store.size).toBe(0); // never sets a cookie (Hosting would strip it)
  });
});

describe('extractSubmittedCsrfToken', () => {
  it('prefers the x-csrf-token header', async () => {
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      headers: { 'x-csrf-token': 'header-token' },
      body: new FormData(),
    });
    expect(await extractSubmittedCsrfToken(request)).toBe('header-token');
  });

  it('reads csrf_token from a multipart form body', async () => {
    const formData = new FormData();
    formData.set('csrf_token', 'abc123');
    formData.set('name', 'Test Product');
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await extractSubmittedCsrfToken(request)).toBe('abc123');
  });

  it('reads csrfToken from a JSON body', async () => {
    const request = new Request('http://example.com/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'x', csrfToken: 'json-token-value' }),
    });
    expect(await extractSubmittedCsrfToken(request)).toBe('json-token-value');
  });

  it('does not consume the body for the caller (JSON)', async () => {
    const request = new Request('http://example.com/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'x', csrfToken: 'json-token-value' }),
    });
    await extractSubmittedCsrfToken(request);
    // If extractSubmittedCsrfToken consumed the original request's body
    // instead of a clone, this second read would throw/fail.
    const body = await request.json();
    expect(body.idToken).toBe('x');
  });

  it('does not consume the body for the caller (multipart)', async () => {
    const fd = new FormData();
    fd.set('csrf_token', EXPECTED_TOKEN);
    fd.set('heroTagline', 'Est. 1980');
    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: fd,
    });
    const extracted = await extractSubmittedCsrfToken(request);
    expect(extracted).toBe(EXPECTED_TOKEN);
    // The API route handler should still be able to read the original body.
    const formData = await request.formData();
    expect(formData.get('heroTagline')).toBe('Est. 1980');
  });

  it('returns null when no token is present', async () => {
    const request = new Request('http://example.com/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'x' }),
    });
    expect(await extractSubmittedCsrfToken(request)).toBeNull();
  });
});

describe('verifyCsrf', () => {
  it('accepts a request whose token matches the session-derived token', async () => {
    const { cookies } = makeFakeCookies({ [SESSION_COOKIE_NAME]: SESSION_VALUE });
    const formData = new FormData();
    formData.set('csrf_token', EXPECTED_TOKEN);
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await verifyCsrf(request, cookies)).toBe(true);
  });

  it('rejects a request with a mismatched token', async () => {
    const { cookies } = makeFakeCookies({ [SESSION_COOKIE_NAME]: SESSION_VALUE });
    const formData = new FormData();
    formData.set('csrf_token', 'totally-wrong-token');
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('rejects a request with no session cookie at all', async () => {
    const { cookies } = makeFakeCookies();
    const formData = new FormData();
    formData.set('csrf_token', 'anything');
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('rejects a request with no submitted token at all', async () => {
    const { cookies } = makeFakeCookies({ [SESSION_COOKIE_NAME]: SESSION_VALUE });
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: new FormData(),
    });
    expect(await verifyCsrf(request, cookies)).toBe(false);
  });
});
