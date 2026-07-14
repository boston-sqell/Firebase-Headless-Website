import type { APIRoute } from 'astro';
import { getCmsData, getRecipes } from '../lib/cms';
import type { Product, Brand, Recipe } from '../lib/cms';

const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? 'https://sosunfihaara.com').replace(/\/$/, '');

// Static pages with their priority and change frequency
const STATIC_PAGES = [
  { path: '/',         priority: '1.0', changefreq: 'weekly'  },
  { path: '/about',    priority: '0.8', changefreq: 'monthly' },
  { path: '/products', priority: '0.9', changefreq: 'weekly'  },
  { path: '/brands',   priority: '0.8', changefreq: 'weekly'  },
  { path: '/distribution', priority: '0.8', changefreq: 'monthly' },
  { path: '/distribution/retail-supply', priority: '0.8', changefreq: 'monthly' },
  { path: '/distribution/hospitality-food-service', priority: '0.8', changefreq: 'monthly' },
  { path: '/distribution/brand-partnerships', priority: '0.8', changefreq: 'monthly' },
  { path: '/about/distribution-network', priority: '0.7', changefreq: 'monthly' },
  { path: '/news',     priority: '0.8', changefreq: 'weekly'  },
  { path: '/recipes',  priority: '0.8', changefreq: 'weekly'  },
  { path: '/contact',  priority: '0.6', changefreq: 'monthly' },
  { path: '/request-quote', priority: '0.9', changefreq: 'monthly' },
];

function url(path: string, priority: string, changefreq: string): string {
  return `
  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export const GET: APIRoute = async () => {
  let products: Product[] = [];
  let brands: Brand[] = [];
  let recipes: Recipe[] = [];

  try {
    const [data, recipeData] = await Promise.all([
      getCmsData(),
      getRecipes()
    ]);
    products = data.products ?? [];
    brands   = data.brands ?? [];
    recipes  = recipeData ?? [];
  } catch {
    // If CMS is unreachable, still serve static pages
  }

  const staticUrls = STATIC_PAGES.map(p => url(p.path, p.priority, p.changefreq)).join('');

  const productUrls = products
    .filter(p => p.code)
    .map(p => url(`/products/${p.code}`, '0.7', 'monthly'))
    .join('');

  const brandUrls = brands
    .filter(b => b.active && b.slug)
    .map(b => url(`/brands/${b.slug}`, '0.7', 'monthly'))
    .join('');

  const recipeUrls = recipes
    .filter(r => r.active && r.id)
    .map(r => url(`/recipes/${r.id}`, '0.7', 'monthly'))
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${productUrls}${brandUrls}${recipeUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
