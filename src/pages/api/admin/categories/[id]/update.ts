import type { APIRoute } from 'astro';
import { adminUpdateCategory } from '../../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateOrder, formatIssues } from '../../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const description = str(formData.get('description'));
  const tag = str(formData.get('tag'));
  const order = parseInt(str(formData.get('order')), 10) || 0;
  const currentImage = str(formData.get('currentImage'));

  const issues = [
    ...validateRequired(name, 'name', 'Category name'),
    ...validateMaxLength(name, 'name', 'Category name', 200),
    ...validateMaxLength(tag, 'tag', 'Tag / icon key', 100),
    ...validateMaxLength(description, 'description', 'Description', 5000),
    ...validateOrder(order, 'order', 'Display order'),
  ];
  if (issues.length > 0) {
    return redirect(`/admin/categories/${id}?error=` + encodeURIComponent(formatIssues(issues)));
  }

  let image = currentImage;
  try {
    const uploaded = await uploadImageIfPresent(formData, 'image', 'categories');
    if (uploaded) image = uploaded;
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect(`/admin/categories/${id}?error=` + encodeURIComponent(message));
  }

  await adminUpdateCategory(id, { name, description, tag, order, image });

  return redirect('/admin/categories?success=' + encodeURIComponent('Category updated.'));
};
