import type { APIRoute } from 'astro';
import { adminDeleteContactSubmission } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminDeleteContactSubmission(id);
  return redirect('/admin/messages?success=' + encodeURIComponent('Message deleted.'));
};
