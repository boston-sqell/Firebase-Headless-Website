import { defineMiddleware } from 'astro:middleware';
import { verifyAdminSession, SESSION_COOKIE_NAME } from './lib/admin-auth';
import { ensureCsrfToken, verifyCsrf } from './lib/csrf';
import { requiresCsrfToken, requiresLoginOriginCheck } from './lib/csrf-policy';
import { isAllowedOrigin } from './lib/origins';

// img-src includes the Firebase Storage domains for images uploaded via the
// admin panel.
// connect-src / script-src include Firebase Auth's identity endpoints, used
// by the admin login page's client-side sign-in call.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://firebasestorage.googleapis.com https://storage.googleapis.com",
  "font-src 'self'",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const secureCookies = !import.meta.env.DEV;

  // Issue (or read back) the CSRF token for every request so any page can
  // embed it in a form, and any API route can verify it below.
  context.locals.csrfToken = ensureCsrfToken(context.cookies, secureCookies);

  const isAdminPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.has(pathname);
  const isAdminApi = pathname.startsWith('/api/admin') && pathname !== '/api/admin/session';

  // The login endpoint (/api/admin/session) is deliberately EXEMPT from the
  // CSRF token check below: the token is derived from the __session cookie
  // (see csrf.ts), which cannot exist before login -- gating login on it
  // would 403 every fresh browser. Login is instead protected by:
  //   1. the Firebase idToken it must carry (unforgeable by a CSRF attacker),
  //   2. this Origin allowlist check (login-CSRF defense).
  // See csrf-policy.ts for the full rationale + regression tests.
  if (requiresLoginOriginCheck(pathname, context.request.method)) {
    const origin = context.request.headers.get('origin');
    if (!isAllowedOrigin(origin)) {
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'session_origin_check_failed',
        method: context.request.method,
        origin,
      }));
      return new Response(JSON.stringify({ error: 'Cross-origin request rejected.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (requiresCsrfToken(pathname, context.request.method)) {
    // extractSubmittedCsrfToken always clones the request before reading the
    // body, so the original stream is never consumed here -- the downstream
    // API route handler can still call request.formData() / request.json().
    const ok = await verifyCsrf(context.request, context.cookies);
    if (!ok) {
      // Structured log so Cloud Run / GCP Logging can surface the exact failure.
      console.warn(JSON.stringify({
        severity: 'WARNING',
        message: 'csrf_check_failed',
        method: context.request.method,
        path: context.url.pathname,
        sessionPresent: !!context.cookies.get(SESSION_COOKIE_NAME)?.value,
      }));
      return new Response(JSON.stringify({ error: 'Invalid or missing CSRF token. Please refresh the page and try again.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (isAdminPage || isAdminApi) {
    const session = await verifyAdminSession(context.cookies);
    if (!session) {
      if (isAdminApi) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      context.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
      return context.redirect(`/admin/login?next=${encodeURIComponent(pathname)}`);
    }
    context.locals.adminUid = session.uid;
    context.locals.adminEmail = session.email;
  }

  const response = await next();

  // Sharp 0.35 reports AVIF output as HEIF, which makes Astro emit image/heif.
  // Normalize the endpoint response so it matches the picture source type and
  // remains usable with X-Content-Type-Options: nosniff.
  if (pathname === '/_image' && context.url.searchParams.get('f') === 'avif') {
    response.headers.set('Content-Type', 'image/avif');
  }

  response.headers.set('Content-Security-Policy', CSP);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Cloud Run + Firebase Hosting both terminate TLS in front of this app, so
  // it is always reached over HTTPS in production. Tell browsers to skip
  // HTTP entirely for a year, including subdomains, and allow preload-list
  // submission (https://hstspreload.org).
  if (!import.meta.env.DEV) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Let Firebase Hosting's CDN cache public HTML: every page view otherwise
  // hits the Cloud Run container (cold starts + full Firestore reads on
  // cache miss). s-maxage is CDN-only -- browsers still revalidate
  // (max-age=0), so a CMS edit is at most ~5 min stale at the edge.
  // Routes that set their own Cache-Control (sitemap, cms.json) win via the
  // has() guard; admin routes are overridden to no-store just below.
  const isPublicPage = !pathname.startsWith('/admin') && !pathname.startsWith('/api');
  if (
    isPublicPage &&
    context.request.method === 'GET' &&
    response.ok &&
    !response.headers.has('Cache-Control')
  ) {
    response.headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  }

  if (isAdminPage || isAdminApi || pathname === '/admin/login') {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
});
