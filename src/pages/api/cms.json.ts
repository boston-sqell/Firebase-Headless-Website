import type { APIRoute } from 'astro';
import { getCmsData } from '../../lib/cms';

export const GET: APIRoute = async ({ request }) => {
  // Restrict CORS: only allow same-origin requests
  const origin = request.headers.get('origin');
  const allowedOrigins = [
    'https://sosunfihaara.com',
    'https://www.sosunfihaara.com',
  ];
  const corsOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  try {
    const data = await getCmsData();

    return new Response(
      JSON.stringify(data),
      {
        headers: {
          'Content-Type': 'application/json',
          // Cache for 1 hour; serve stale for up to 24 hours while revalidating in the background
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': corsOrigin,
          'Vary': 'Origin',
        }
      }
    );
  } catch (err) {
    console.error('[CMS API]', err);
    return new Response(
      JSON.stringify({ products: [], brands: [], site: {} }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
