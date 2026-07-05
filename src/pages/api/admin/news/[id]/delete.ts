import type { APIRoute } from 'astro';
import { adminDeleteNewsItem } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  if (params.id) {
    await adminDeleteNewsItem(params.id);
  }
  return redirect('/admin/news?success=' + encodeURIComponent('News item deleted.'));
};
