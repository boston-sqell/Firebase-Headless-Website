import type { APIRoute } from 'astro';
import { adminDeleteRecipe } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  if (params.id) {
    await adminDeleteRecipe(params.id);
  }
  return redirect('/admin/recipes?success=' + encodeURIComponent('Recipe deleted.'));
};
