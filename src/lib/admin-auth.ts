/**
 * Admin session verification.
 *
 * Model: Firebase Auth is used ONLY as a login mechanism for a small,
 * manually-provisioned pool of staff accounts (see scripts/create-admin.mjs
 * -- there is no public sign-up path anywhere in this app). On successful
 * sign-in, the client's Firebase ID token is exchanged server-side for an
 * httpOnly session cookie (src/pages/api/admin/session.ts). All Firestore
 * reads/writes triggered from the admin panel happen server-side via the
 * Admin SDK (admin-data.ts) -- the browser never talks to Firestore
 * directly, so Firestore Security Rules stay "deny all" (see
 * firestore.rules) and aren't in the trust path at all.
 *
 * Defense in depth: every admin account must carry the custom claim
 * `admin: true`, set by scripts/create-admin.mjs. A valid session cookie
 * alone is not enough.
 */

import type { AstroCookies } from "astro";
import { getAdminAuth } from "./firebase-admin";

export const SESSION_COOKIE_NAME = "__session";

export interface AdminSession {
  uid: string;
  email: string | undefined;
}

export async function verifyAdminSession(cookies: AstroCookies): Promise<AdminSession | null> {
  const cookie = cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    const decoded = await getAdminAuth().verifySessionCookie(cookie, true);
    if (decoded.admin !== true) return null;
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
