import type { APIRoute } from 'astro';
import { getCmsData } from '../lib/cms';
import type { Product, Brand } from '../lib/cms';

const SITE_URL = (import.meta.env.PUBLIC_SITE_URL ?? 'https://sosunfihaara.com').replace(/\/$/, '');

// Static pages with their priority and change frequency
const STATIC_PAGES = [
  { path: '/',         priority: '1.0', changefreq: 'weekly'  },
  { path: '/about',    priority: '0.8', changefreq: 'monthly' },
  { path: '/products', priority: '0.9', changefreq: 'weekly'  },
  { path: '/brands',   priority: '0.8', changefreq: 'weekly'  },
  // /news and /recipes are intentionally EXCLUDED until they carry real CMS
  // content -- both currently render hardcoded placeholder articles, and
  // advertising placeholder pages to crawlers hurts more than it helps.
  // Re-add them here when the News/Recipes collections go live.
  { path: '/contact',  priority: '0.6', changefreq: 'monthly' },
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

  try {
    const data = await getCmsData();
    products = data.products ?? [];
    brands   = data.brands ?? [];
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${productUrls}${brandUrls}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
