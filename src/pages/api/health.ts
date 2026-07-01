import type { APIRoute } from 'astro';

const BUILD_TIME = new Date().toISOString();

export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      buildTime: BUILD_TIME,
      uptime: process.uptime ? `${Math.floor(process.uptime())}s` : 'unknown',
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
};
