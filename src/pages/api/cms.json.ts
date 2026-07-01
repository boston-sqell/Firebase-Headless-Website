import type { APIRoute } from 'astro';
import { getCmsData } from '../../lib/cms';
import { isAllowedOrigin } from '../../lib/origins';

export const GET: APIRoute = async ({ request }) => {
  const origin = request.headers.get('origin');

  // SEC-007: Only set CORS header when origin is explicitly in the allowlist
  const corsHeaders: Record<string, string> = {};
  if (origin && isAllowedOrigin(origin)) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
    corsHeaders['Vary'] = 'Origin';
  }

  try {
    const data = await getCmsData();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        ...corsHeaders,
      }
    });
  } catch (err) {
    console.error('[CMS API]', err);
    return new Response(
      JSON.stringify({ products: [], brands: [], site: {} }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};
