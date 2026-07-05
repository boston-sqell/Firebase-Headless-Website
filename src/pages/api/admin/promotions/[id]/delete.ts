import type { APIRoute } from 'astro';
import { adminDeletePromotion } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  if (params.id) {
    await adminDeletePromotion(params.id);
  }
  return redirect('/admin/promotions?success=' + encodeURIComponent('Promotion deleted.'));
};
