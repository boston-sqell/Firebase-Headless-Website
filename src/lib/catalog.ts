import type { Category, Product } from './cms';

export interface CatalogSubcategory {
  key: string;
  name: string;
  productCount: number;
}

export interface CatalogCategory {
  key: string;
  name: string;
  order: number;
  productCount: number;
  subcategories: CatalogSubcategory[];
}

export function normalizeCatalogValue(value?: string): string {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildCatalogCategories(products: Product[], definitions: Category[]): CatalogCategory[] {
  const configured = new Map<string, { name: string; order: number }>();
  for (const definition of definitions) {
    const name = definition.name?.trim();
    const key = normalizeCatalogValue(name);
    if (!key || !name) continue;
    const existing = configured.get(key);
    if (!existing || definition.order < existing.order) {
      configured.set(key, { name, order: definition.order });
    }
  }

  const grouped = new Map<string, { fallbackName: string; products: Product[] }>();
  for (const product of products) {
    const fallbackName = product.category?.trim();
    const key = normalizeCatalogValue(fallbackName);
    if (!key || !fallbackName) continue;
    const group = grouped.get(key) || { fallbackName, products: [] };
    group.products.push(product);
    grouped.set(key, group);
  }

  return Array.from(grouped, ([key, group]) => {
    const subcategories = new Map<string, { name: string; productCount: number }>();
    for (const product of group.products) {
      const name = product.subcategory?.trim();
      const subcategoryKey = normalizeCatalogValue(name);
      if (!subcategoryKey || !name) continue;
      const existing = subcategories.get(subcategoryKey);
      subcategories.set(subcategoryKey, {
        name: existing?.name || name,
        productCount: (existing?.productCount || 0) + 1,
      });
    }

    const definition = configured.get(key);
    return {
      key,
      name: definition?.name || group.fallbackName,
      order: definition?.order ?? Number.MAX_SAFE_INTEGER,
      productCount: group.products.length,
      subcategories: Array.from(subcategories, ([subcategoryKey, subcategory]) => ({
        key: subcategoryKey,
        ...subcategory,
      })).sort((a, b) => a.name.localeCompare(b.name)),
    };
  }).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export function productMatchesSearch(product: Product, query: string): boolean {
  const terms = normalizeCatalogValue(query).split(' ').filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = normalizeCatalogValue([
    product.name,
    product.brandName,
    product.code,
    product.category,
    product.subcategory,
    product.keywords,
  ].filter(Boolean).join(' '));

  return terms.every(term => searchableText.includes(term));
}
