/**
 * Canonical list of allowed origins for CORS and CSRF checks.
 *
 * Set PUBLIC_SITE_URL in .env.local to your production domain, e.g.:
 *   PUBLIC_SITE_URL=https://sosunfihaara.com
 *
 * The www. variant is always included automatically.
 * Firebase preview URLs are included when FIREBASE_PREVIEW_URL is set.
 */
function buildAllowedOrigins(): string[] {
  const origins: string[] = [];

  // Primary domain from env (production or custom)
  const siteUrl = import.meta.env.PUBLIC_SITE_URL;
  if (siteUrl) {
    const clean = siteUrl.replace(/\/$/, '');
    origins.push(clean);
    // Always include www. variant
    if (!clean.includes('://www.')) {
      origins.push(clean.replace('://', '://www.'));
    }
  }

  // Fallback: hardcoded production domains
  origins.push('https://sosunfihaara.com', 'https://www.sosunfihaara.com');

  // Firebase default hosting domains
  const projectId = import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
  if (projectId) {
    origins.push(`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`);
  }

  // Local dev
  if (import.meta.env.DEV) {
    origins.push('http://localhost:4321', 'http://localhost:4322', 'http://127.0.0.1:4321', 'http://127.0.0.1:4322');
  }

  // Firebase Hosting preview channel URL (optional, for staging)
  const firebasePreview = import.meta.env.FIREBASE_PREVIEW_URL;
  if (firebasePreview) origins.push(firebasePreview);

  // Deduplicate
  return [...new Set(origins)];
}

export const ALLOWED_ORIGINS = buildAllowedOrigins();

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true; // same-origin SSR requests have no Origin header
  return ALLOWED_ORIGINS.some(o => origin === o);
}
