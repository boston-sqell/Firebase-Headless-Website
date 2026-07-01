import { defineMiddleware } from 'astro:middleware';
import { setRuntimeConfig } from './lib/cms';
import { verifyAdminSession, SESSION_COOKIE_NAME } from './lib/admin-auth';
import { ensureCsrfToken, verifyCsrf } from './lib/csrf';

// img-src includes static.wixstatic.com for migrated images still on Wix CDN,
// and Firebase Storage domains for images uploaded via the admin panel.
// connect-src / script-src include Firebase Auth's identity endpoints, used
// by the admin login page's client-side sign-in call.
// style-src / font-src include Google Fonts, used by Layout.astro /
// homepage.css.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https://static.wixstatic.com https://firebasestorage.googleapis.com https://storage.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const onRequest = defineMiddleware(async (context, next) => {
  setRuntimeConfig({});

  const { pathname } = context.url;
  const secureCookies = !import.meta.env.DEV;

  // Issue (or read back) the CSRF token for every request so any page can
  // embed it in a form, and any API route can verify it below.
  context.locals.csrfToken = ensureCsrfToken(context.cookies, secureCookies);

  const isAdminPage = pathname.startsWith('/admin') && !PUBLIC_ADMIN_PATHS.has(pathname);
  const isAdminApi = pathname.startsWith('/api/admin') && pathname !== '/api/admin/session';
  // Broader than isAdminApi on purpose: this also covers /api/admin/session
  // itself (login), which isAdminApi excludes because there's no session to
  // check yet at that point.
  const isAdminApiPath = pathname.startsWith('/api/admin');

  if (isAdminApiPath && MUTATING_METHODS.has(context.request.method)) {
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
        cookiePresent: !!context.cookies.get('csrf_token')?.value,
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

  if (isAdminPage || isAdminApi) {
    response.headers.set('Cache-Control', 'private, no-store');
  }

  return response;
});
