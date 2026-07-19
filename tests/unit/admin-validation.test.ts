import { describe, it, expect } from 'vitest';
import {
  validateRequired,
  validateMaxLength,
  validateSlug,
  validatePrice,
  validateOrder,
  formatIssues,
} from '../../src/lib/admin-validation';

describe('validateRequired', () => {
  it('flags empty strings', () => {
    expect(validateRequired('', 'name', 'Product name')).toHaveLength(1);
  });
  it('passes non-empty strings', () => {
    expect(validateRequired('Sun Fresh', 'name', 'Product name')).toHaveLength(0);
  });
});

describe('validateMaxLength', () => {
  it('flags strings past the limit', () => {
    expect(validateMaxLength('a'.repeat(10), 'f', 'Field', 5)).toHaveLength(1);
  });
  it('allows strings at or under the limit', () => {
    expect(validateMaxLength('a'.repeat(5), 'f', 'Field', 5)).toHaveLength(0);
    expect(validateMaxLength('', 'f', 'Field', 5)).toHaveLength(0);
  });
});

describe('validateSlug', () => {
  it('accepts lowercase-hyphen slugs', () => {
    expect(validateSlug('sun-fresh', 'slug', 'Slug')).toHaveLength(0);
    expect(validateSlug('pascual', 'slug', 'Slug')).toHaveLength(0);
  });
  it('is a no-op for an empty value (required-ness is a separate check)', () => {
    expect(validateSlug('', 'slug', 'Slug')).toHaveLength(0);
  });
  it('rejects spaces, uppercase, and double hyphens', () => {
    expect(validateSlug('Sun Fresh', 'slug', 'Slug')).toHaveLength(1);
    expect(validateSlug('SunFresh', 'slug', 'Slug')).toHaveLength(1);
    expect(validateSlug('sun--fresh', 'slug', 'Slug')).toHaveLength(1);
    expect(validateSlug('-sun-fresh', 'slug', 'Slug')).toHaveLength(1);
  });
});

describe('validatePrice', () => {
  it('accepts plain numbers with up to 2 decimals', () => {
    expect(validatePrice('125', 'price', 'Price')).toHaveLength(0);
    expect(validatePrice('125.5', 'price', 'Price')).toHaveLength(0);
    expect(validatePrice('125.50', 'price', 'Price')).toHaveLength(0);
    expect(validatePrice('1,231.49', 'price', 'Price')).toHaveLength(0);
    expect(validatePrice('3,420', 'price', 'Price')).toHaveLength(0);
  });
  it('is a no-op for an empty value ("Request price" case)', () => {
    expect(validatePrice('', 'price', 'Price')).toHaveLength(0);
  });
  it('rejects currency symbols, words, and too many decimals', () => {
    expect(validatePrice('MVR 125', 'price', 'Price')).toHaveLength(1);
    expect(validatePrice('free', 'price', 'Price')).toHaveLength(1);
    expect(validatePrice('125.500', 'price', 'Price')).toHaveLength(1);
    expect(validatePrice('-5', 'price', 'Price')).toHaveLength(1);
    expect(validatePrice('12,34', 'price', 'Price')).toHaveLength(1);
  });
});

describe('validateOrder', () => {
  it('accepts whole numbers in range', () => {
    expect(validateOrder(0, 'order', 'Order')).toHaveLength(0);
    expect(validateOrder(42, 'order', 'Order')).toHaveLength(0);
  });
  it('rejects negatives, non-integers, and out-of-range values', () => {
    expect(validateOrder(-1, 'order', 'Order')).toHaveLength(1);
    expect(validateOrder(1.5, 'order', 'Order')).toHaveLength(1);
    expect(validateOrder(100000, 'order', 'Order')).toHaveLength(1);
    expect(validateOrder(Number.NaN, 'order', 'Order')).toHaveLength(1);
  });
});

describe('formatIssues', () => {
  it('joins messages with a space', () => {
    const issues = [
      { field: 'a', message: 'A is bad.' },
      { field: 'b', message: 'B is also bad.' },
    ];
    expect(formatIssues(issues)).toBe('A is bad. B is also bad.');
  });
  it('returns an empty string for no issues', () => {
    expect(formatIssues([])).toBe('');
  });
});
