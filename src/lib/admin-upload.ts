/**
 * Image upload helper for the admin panel.
 *
 * Uploads happen entirely server-side: the browser sends a normal
 * multipart/form-data POST to an /api/admin/* route (already gated by
 * middleware.ts's session check), and this module pushes the file to
 * Firebase Storage using the Admin SDK. The browser never talks to
 * Storage directly, so storage.rules can stay "deny all client access".
 */

import { randomUUID } from 'node:crypto';
import { getAdminStorage } from './firebase-admin';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

export class UploadError extends Error {}

export async function uploadImageIfPresent(formData: FormData, fieldName: string, folder: string): Promise<string | undefined> {
  const file = formData.get(fieldName);
  if (!file || !(file instanceof File) || file.size === 0) return undefined;

  if (!ALLOWED_TYPES.has(file.type)) {
    throw new UploadError(`Unsupported image type "${file.type}". Use JPEG, PNG, WebP, GIF, or SVG.`);
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError('Image is too large (max 5MB).');
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${folder}/${Date.now()}-${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const bucket = getAdminStorage().bucket();
  const storageFile = bucket.file(path);

  await storageFile.save(buffer, {
    contentType: file.type,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });
  await storageFile.makePublic();

  return storageFile.publicUrl();
}
