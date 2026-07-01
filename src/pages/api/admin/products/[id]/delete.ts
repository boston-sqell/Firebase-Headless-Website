import type { APIRoute } from 'astro';
import { adminDeleteProduct } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminDeleteProduct(id);
  return redirect('/admin/products?success=' + encodeURIComponent('Product deleted.'));
};
