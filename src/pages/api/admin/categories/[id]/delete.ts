import type { APIRoute } from 'astro';
import { adminDeleteCategory } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminDeleteCategory(id);
  return redirect('/admin/categories?success=' + encodeURIComponent('Category deleted.'));
};
