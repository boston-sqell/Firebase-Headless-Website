/**
 * Regression tests for the C2 defect: the CSRF token is derived from the
 * __session cookie, which cannot exist before login. If the middleware ever
 * requires the CSRF token on POST /api/admin/session again, every fresh
 * browser will 403 on first login. These tests pin the policy.
 */
import { describe, it, expect } from 'vitest';
import { requiresCsrfToken, requiresLoginOriginCheck, SESSION_ENDPOINT } from '../../src/lib/csrf-policy';

describe('csrf-policy: requiresCsrfToken', () => {
  it('does NOT require the CSRF token for the login endpoint (C2 regression)', () => {
    expect(requiresCsrfToken(SESSION_ENDPOINT, 'POST')).toBe(false);
    expect(requiresCsrfToken(SESSION_ENDPOINT, 'DELETE')).toBe(false);
  });

  it('requires the CSRF token for all other mutating admin API routes', () => {
    expect(requiresCsrfToken('/api/admin/products/create', 'POST')).toBe(true);
    expect(requiresCsrfToken('/api/admin/products/abc/delete', 'POST')).toBe(true);
    expect(requiresCsrfToken('/api/admin/site-content/update', 'PUT')).toBe(true);
    expect(requiresCsrfToken('/api/admin/messages/xyz', 'DELETE')).toBe(true);
  });

  it('never requires the token for non-mutating methods', () => {
    expect(requiresCsrfToken('/api/admin/products', 'GET')).toBe(false);
    expect(requiresCsrfToken('/api/admin/products', 'HEAD')).toBe(false);
  });

  it('never requires the token outside /api/admin', () => {
    expect(requiresCsrfToken('/api/contact', 'POST')).toBe(false);
    expect(requiresCsrfToken('/contact', 'POST')).toBe(false);
  });
});

describe('csrf-policy: requiresLoginOriginCheck', () => {
  it('applies the Origin check to mutating requests on the login endpoint', () => {
    expect(requiresLoginOriginCheck(SESSION_ENDPOINT, 'POST')).toBe(true);
    expect(requiresLoginOriginCheck(SESSION_ENDPOINT, 'DELETE')).toBe(true);
  });

  it('does not apply it anywhere else', () => {
    expect(requiresLoginOriginCheck('/api/admin/products/create', 'POST')).toBe(false);
    expect(requiresLoginOriginCheck(SESSION_ENDPOINT, 'GET')).toBe(false);
  });
});
