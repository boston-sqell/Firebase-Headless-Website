import { describe, expect, it } from 'vitest';
import {
  getEffectivePriceBasis,
  getProductPackText,
  getProductPriceText,
  isPriceBasis,
} from '../../src/lib/product-pricing';

describe('product price presentation', () => {
  it('treats legacy multipack records as case prices', () => {
    const product = { price: '155', packSize: '6X250ML' };
    expect(getEffectivePriceBasis(product)).toBe('case');
    expect(getProductPriceText(product)).toBe('MVR 155 per case');
    expect(getProductPackText(product)).toBe('Case configuration: 6X250ML');
  });

  it('keeps legacy prices without a pack configuration indicative', () => {
    const product = { price: '255' };
    expect(getEffectivePriceBasis(product)).toBe('indicative');
    expect(getProductPriceText(product)).toBe('Indicative price: MVR 255');
  });

  it('honours an explicit unit or pack basis', () => {
    expect(getProductPriceText({ price: '25', priceBasis: 'unit' })).toBe('MVR 25 per unit');
    expect(getProductPriceText({ price: '90', priceBasis: 'pack', packSize: '500g' })).toBe('MVR 90 per pack');
  });

  it('uses current-on-request copy whenever the amount is blank', () => {
    expect(getProductPriceText({ price: '', priceBasis: 'case', packSize: '12X1L' })).toBe('Current price on request');
  });

  it('rejects unknown stored or submitted basis values', () => {
    expect(isPriceBasis('case')).toBe(true);
    expect(isPriceBasis('carton')).toBe(false);
  });
});