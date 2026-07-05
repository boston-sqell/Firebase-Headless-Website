import type { APIRoute } from 'astro';
import { adminDeleteFAQ } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  if (params.id) {
    await adminDeleteFAQ(params.id);
  }
  return redirect('/admin/faqs?success=' + encodeURIComponent('FAQ deleted.'));
};
