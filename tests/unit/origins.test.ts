import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../../src/lib/origins';

// Note: this only exercises the hardcoded fallback origins and the
// same-origin passthrough, since PUBLIC_SITE_URL / FIREBASE_PREVIEW_URL
// come from .env.local and aren't set in the test environment -- those are
// additive on top of the fallbacks, so this doesn't need to depend on them.
describe('isAllowedOrigin', () => {
  it('treats a missing Origin header as same-origin (allowed)', () => {
    expect(isAllowedOrigin(null)).toBe(true);
  });

  it('allows the production domain and its www variant', () => {
    expect(isAllowedOrigin('https://sosunfihaara.com')).toBe(true);
    expect(isAllowedOrigin('https://www.sosunfihaara.com')).toBe(true);
  });

  it('rejects an arbitrary third-party origin', () => {
    expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
  });

  it('rejects a plain HTTP downgrade of an allowed origin', () => {
    expect(isAllowedOrigin('http://sosunfihaara.com')).toBe(false);
  });
});
