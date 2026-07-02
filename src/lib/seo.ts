/**
 * Shared SEO constants so Layout.astro and HomeLayout.astro render the same
 * <head> metadata (they previously diverged: the home page shipped without
 * Organization schema and with the logo as its og:image).
 */

export const SITE_URL = 'https://sosunfihaara.com';

export const DEFAULT_TITLE = 'Sosun Fihaara | Wholesale & Retail Groceries in the Maldives';

export const DEFAULT_DESCRIPTION =
  'A trusted wholesale and retail grocery supplier in the Maldives, specializing in authentic global brands, food service supply, and consumer goods.';

/** Real 1200×630 share image — NOT the logo (see public/og-default.png). */
export const DEFAULT_OG_IMAGE = '/og-default.png';

export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Sosun Fihaara',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  description:
    'A trusted wholesale and retail grocery supplier in the Maldives, distributing authentic global FMCG brands since 1980.',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Moosa Ibrahim Didi Goalhi',
    addressLocality: 'Male',
    addressCountry: 'MV',
  },
  telephone: '+960-331-3020',
  email: 'info@sosunfihaara.com',
  sameAs: [
    'https://www.facebook.com/sosunfihaara',
    'https://www.instagram.com/sosun.fihaara',
  ],
};
