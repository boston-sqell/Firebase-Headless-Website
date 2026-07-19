import type { Product, PriceBasis } from './cms';

export const PRICE_BASES: PriceBasis[] = ['case', 'pack', 'unit', 'indicative'];

export function isPriceBasis(value: string): value is PriceBasis {
  return PRICE_BASES.includes(value as PriceBasis);
}

/**
 * Older catalogue records predate the explicit priceBasis field. Their
 * multipack configurations (for example 24X500ML) describe case pricing.
 * Records without a configuration remain deliberately non-committal.
 */
export function getEffectivePriceBasis(product: Pick<Product, 'priceBasis' | 'packSize'>): PriceBasis {
  if (product.priceBasis && isPriceBasis(product.priceBasis)) return product.priceBasis;
  return product.packSize ? 'case' : 'indicative';
}

export function getProductPriceText(product: Pick<Product, 'price' | 'priceBasis' | 'packSize'>): string {
  if (!product.price) return 'Current price on request';

  const amount = `MVR ${product.price}`;
  switch (getEffectivePriceBasis(product)) {
    case 'case': return `${amount} per case`;
    case 'pack': return `${amount} per pack`;
    case 'unit': return `${amount} per unit`;
    case 'indicative': return `Indicative price: ${amount}`;
  }
}

export function getProductPackText(product: Pick<Product, 'packSize' | 'priceBasis'>): string | null {
  if (!product.packSize) return null;

  switch (getEffectivePriceBasis(product)) {
    case 'case': return `Case configuration: ${product.packSize}`;
    case 'pack': return `Pack size: ${product.packSize}`;
    case 'unit': return `Unit size: ${product.packSize}`;
    case 'indicative': return `Listed configuration: ${product.packSize}`;
  }
}

export function getPriceBasisLabel(product: Pick<Product, 'priceBasis' | 'packSize'>): string {
  switch (getEffectivePriceBasis(product)) {
    case 'case': return 'Per case';
    case 'pack': return 'Per pack';
    case 'unit': return 'Per unit';
    case 'indicative': return 'Indicative';
  }
}