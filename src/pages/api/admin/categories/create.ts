import type { APIRoute } from 'astro';
import { adminCreateCategory, adminListCategories } from '../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateOrder, formatIssues } from '../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const description = str(formData.get('description'));
  const tag = str(formData.get('tag'));
  const orderStr = str(formData.get('order'));

  const issues = [
    ...validateRequired(name, 'name', 'Category name'),
    ...validateMaxLength(name, 'name', 'Category name', 200),
    ...validateMaxLength(tag, 'tag', 'Tag / icon key', 100),
    ...validateMaxLength(description, 'description', 'Description', 5000),
  ];
  if (issues.length > 0) {
    return redirect('/admin/categories/new?error=' + encodeURIComponent(formatIssues(issues)));
  }

  let order = parseInt(orderStr, 10);
  if (Number.isNaN(order)) {
    const existing = await adminListCategories();
    order = existing.length;
  }
  const orderIssues = validateOrder(order, 'order', 'Display order');
  if (orderIssues.length > 0) {
    return redirect('/admin/categories/new?error=' + encodeURIComponent(formatIssues(orderIssues)));
  }

  let image: string | undefined;
  try {
    image = await uploadImageIfPresent(formData, 'image', 'categories');
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/categories/new?error=' + encodeURIComponent(message));
  }

  await adminCreateCategory({ name, description, tag, order, image: image || '' });

  return redirect('/admin/categories?success=' + encodeURIComponent('Category created.'));
};
