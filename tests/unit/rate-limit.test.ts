import { describe, it, expect, vi } from 'vitest';
import { isAllowed, getClientKey } from '../../src/lib/rate-limit';

describe('rate-limit: isAllowed', () => {
  it('allows requests under the limit', () => {
    const key = `test-${Math.random()}`;
    expect(isAllowed(key, 3, 60_000)).toBe(true);
    expect(isAllowed(key, 3, 60_000)).toBe(true);
    expect(isAllowed(key, 3, 60_000)).toBe(true);
  });

  it('blocks requests once the limit is reached', () => {
    const key = `test-${Math.random()}`;
    expect(isAllowed(key, 2, 60_000)).toBe(true);
    expect(isAllowed(key, 2, 60_000)).toBe(true);
    expect(isAllowed(key, 2, 60_000)).toBe(false);
    expect(isAllowed(key, 2, 60_000)).toBe(false);
  });

  it('resets the count once the window has elapsed', () => {
    vi.useFakeTimers();
    try {
      const key = `test-${Math.random()}`;
      expect(isAllowed(key, 1, 1000)).toBe(true);
      expect(isAllowed(key, 1, 1000)).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(isAllowed(key, 1, 1000)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('tracks separate keys independently', () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    expect(isAllowed(keyA, 1, 60_000)).toBe(true);
    expect(isAllowed(keyA, 1, 60_000)).toBe(false);
    // A different key should not be affected by A's bucket being exhausted.
    expect(isAllowed(keyB, 1, 60_000)).toBe(true);
  });
});

describe('rate-limit: getClientKey', () => {
  it('uses the LAST entry of x-forwarded-for (appended by Google front end, unspoofable)', () => {
    const request = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    });
    expect(getClientKey(request)).toBe('10.0.0.1');
  });

  it('ignores attacker-prepended entries', () => {
    // A client can send its own x-forwarded-for; proxies append the real
    // peer address. Rotating the first entry must not evade the limiter.
    const spoofA = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '1.1.1.1, 198.51.100.7' },
    });
    const spoofB = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '2.2.2.2, 198.51.100.7' },
    });
    expect(getClientKey(spoofA)).toBe(getClientKey(spoofB));
  });

  it('handles a single-entry header', () => {
    const request = new Request('http://example.com', {
      headers: { 'x-forwarded-for': '203.0.113.5' },
    });
    expect(getClientKey(request)).toBe('203.0.113.5');
  });

  it('falls back to "unknown" with no header', () => {
    const request = new Request('http://example.com');
    expect(getClientKey(request)).toBe('unknown');
  });
});
