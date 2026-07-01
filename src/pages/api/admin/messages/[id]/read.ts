import type { APIRoute } from 'astro';
import { adminMarkContactSubmissionRead } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminMarkContactSubmissionRead(id, true);
  return redirect('/admin/messages');
};
