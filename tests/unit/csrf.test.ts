import { describe, it, expect } from 'vitest';
import { ensureCsrfToken, verifyCsrf, extractSubmittedCsrfToken, CSRF_COOKIE_NAME } from '../../src/lib/csrf';
import type { AstroCookies } from 'astro';

/**
 * Minimal in-memory stand-in for Astro's cookie jar -- just enough of the
 * interface (get/set) for csrf.ts to work against, so these tests don't
 * need a running Astro server.
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

describe('ensureCsrfToken', () => {
  it('creates and persists a token on first call', () => {
    const { cookies, store } = makeFakeCookies();
    const token = ensureCsrfToken(cookies, true);
    expect(token).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
    expect(store.get(CSRF_COOKIE_NAME)).toBe(token);
  });

  it('returns the same token on subsequent calls', () => {
    const { cookies } = makeFakeCookies();
    const first = ensureCsrfToken(cookies, true);
    const second = ensureCsrfToken(cookies, true);
    expect(second).toBe(first);
  });
});

describe('extractSubmittedCsrfToken', () => {
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
    const { cookies } = makeFakeCookies();
    const token = ensureCsrfToken(cookies, false);
    const fd = new FormData();
    fd.set('csrf_token', token);
    fd.set('heroTagline', 'Est. 1980');
    const request = new Request('http://example.com/api/admin/site-content/update', {
      method: 'POST',
      body: fd,
    });
    // CSRF token should be extracted without consuming the original stream.
    const extracted = await extractSubmittedCsrfToken(request);
    expect(extracted).toBe(token);
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
  it('accepts a request whose token matches the cookie', async () => {
    const { cookies } = makeFakeCookies();
    const token = ensureCsrfToken(cookies, true);
    const formData = new FormData();
    formData.set('csrf_token', token);
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await verifyCsrf(request, cookies)).toBe(true);
  });

  it('rejects a request with a mismatched token', async () => {
    const { cookies } = makeFakeCookies();
    ensureCsrfToken(cookies, true);
    const formData = new FormData();
    formData.set('csrf_token', 'totally-wrong-token');
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: formData,
    });
    expect(await verifyCsrf(request, cookies)).toBe(false);
  });

  it('rejects a request with no cookie set at all', async () => {
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
    const { cookies } = makeFakeCookies();
    ensureCsrfToken(cookies, true);
    const request = new Request('http://example.com/api/admin/products/create', {
      method: 'POST',
      body: new FormData(),
    });
    expect(await verifyCsrf(request, cookies)).toBe(false);
  });
});
