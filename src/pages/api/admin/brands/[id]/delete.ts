import type { APIRoute } from 'astro';
import { adminDeleteBrand } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminDeleteBrand(id);
  return redirect('/admin/brands?success=' + encodeURIComponent('Brand deleted.'));
};
