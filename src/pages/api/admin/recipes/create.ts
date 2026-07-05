import type { APIRoute } from 'astro';
import { adminCreateRecipe } from '../../../../lib/admin-data';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const title = str(formData.get('title'));
  const pill = str(formData.get('pill'));
  const meta = str(formData.get('meta'));
  const prepTime = str(formData.get('prepTime'));
  const cookTime = str(formData.get('cookTime'));
  const description = str(formData.get('description'));
  const featured = formData.get('featured') === 'on';
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect('/admin/recipes/new?error=' + encodeURIComponent('Title is required.'));
  }

  let image: string | undefined;
  try {
    image = await uploadImageIfPresent(formData, 'image', 'recipes');
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/recipes/new?error=' + encodeURIComponent(message));
  }

  await adminCreateRecipe({
    title, pill, meta, prepTime, cookTime, description, featured, active,
    image: image || '',
  });

  return redirect('/admin/recipes?success=' + encodeURIComponent('Recipe created.'));
};
