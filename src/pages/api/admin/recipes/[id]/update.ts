import type { APIRoute } from 'astro';
import { adminUpdateRecipe } from '../../../../../lib/admin-data';
import { uploadImageIfPresent, UploadError } from '../../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const formData = await request.formData();
  const { id } = params;

  if (!id) return redirect('/admin/recipes');

  const title = str(formData.get('title'));
  const pill = str(formData.get('pill'));
  const meta = str(formData.get('meta'));
  const prepTime = str(formData.get('prepTime'));
  const cookTime = str(formData.get('cookTime'));
  const description = str(formData.get('description'));
  const featured = formData.get('featured') === 'on';
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect(`/admin/recipes/${id}?error=` + encodeURIComponent('Title is required.'));
  }

  let image = str(formData.get('currentImage'));
  try {
    const newImage = await uploadImageIfPresent(formData, 'image', 'recipes');
    if (newImage) image = newImage;
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect(`/admin/recipes/${id}?error=` + encodeURIComponent(message));
  }

  await adminUpdateRecipe(id, {
    title, pill, meta, prepTime, cookTime, description, featured, active, image
  });

  return redirect('/admin/recipes?success=' + encodeURIComponent('Recipe updated.'));
};
