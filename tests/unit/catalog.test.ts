import { describe, expect, it } from 'vitest';
import { buildCatalogCategories, normalizeCatalogValue, productMatchesSearch } from '../../src/lib/catalog';
import type { Category, Product } from '../../src/lib/cms';

const product = (overrides: Partial<Product>): Product => ({
  name: 'Pascual Whole Milk',
  brandName: 'Pascual',
  category: 'Dairy',
  subcategory: 'Milk',
  code: 'PAS-001',
  brandSlug: 'pascual',
  keywords: 'long life uht',
  ...overrides,
});

describe('normalizeCatalogValue', () => {
  it('normalizes casing, whitespace, punctuation, accents, and ampersands', () => {
    expect(normalizeCatalogValue('  Sauces &  Dressings ')).toBe('sauces and dressings');
    expect(normalizeCatalogValue('CAFÉ')).toBe('cafe');
  });
});

describe('buildCatalogCategories', () => {
  it('deduplicates configured labels and includes categories used by active products', () => {
    const definitions: Category[] = [
      { name: 'Dairy', order: 6 },
      { name: ' dairy ', order: 8 },
      { name: 'Unused category', order: 1 },
    ];
    const result = buildCatalogCategories([
      product({}),
      product({ name: 'Butter', category: ' dairy ', subcategory: 'Butter' }),
      product({ name: 'Cake Mix', category: 'Baking', subcategory: 'Mixes' }),
    ], definitions);

    expect(result.map(category => ({ name: category.name, count: category.productCount }))).toEqual([
      { name: 'Dairy', count: 2 },
      { name: 'Baking', count: 1 },
    ]);
    expect(result[0].subcategories.map(subcategory => subcategory.name)).toEqual(['Butter', 'Milk']);
  });
});

describe('productMatchesSearch', () => {
  it('searches product, brand, code, category, subcategory, and keywords', () => {
    expect(productMatchesSearch(product({}), 'Pascual milk')).toBe(true);
    expect(productMatchesSearch(product({}), 'PAS-001')).toBe(true);
    expect(productMatchesSearch(product({}), 'dairy uht')).toBe(true);
    expect(productMatchesSearch(product({}), 'chocolate')).toBe(false);
  });
});
