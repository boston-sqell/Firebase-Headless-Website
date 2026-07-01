import type { APIRoute } from 'astro';
import { getAdminAuth } from '../../../lib/firebase-admin';
import { SESSION_COOKIE_NAME } from '../../../lib/admin-auth';
import { isAllowed, getClientKey } from '../../../lib/rate-limit';

const SESSION_EXPIRES_IN_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isAllowed(`admin-login:${getClientKey(request)}`, 10, 15 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 });
  }

  const { idToken } = body;
  if (!idToken || typeof idToken !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing idToken' }), { status: 400 });
  }

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    if (decoded.admin !== true) {
      return new Response(JSON.stringify({ error: 'This account does not have admin access.' }), { status: 403 });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRES_IN_MS });

    cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      path: '/',
      httpOnly: true,
      secure: !import.meta.env.DEV,
      sameSite: 'lax',
      maxAge: SESSION_EXPIRES_IN_MS / 1000,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'admin_session_create_failed', error: String(err) }));
    return new Response(JSON.stringify({ error: 'Sign-in failed. Please try again.' }), { status: 401 });
  }
};

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
