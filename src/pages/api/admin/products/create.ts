import type { APIRoute } from 'astro';
import { adminCreateProduct } from '../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateSlug, validatePrice, formatIssues } from '../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const brandName = str(formData.get('brandName'));
  const brandSlug = str(formData.get('brandSlug'));
  const category = str(formData.get('category'));
  const subcategory = str(formData.get('subcategory'));
  const code = str(formData.get('code'));
  const price = str(formData.get('price'));
  const packSize = str(formData.get('packSize'));
  const keywords = str(formData.get('keywords'));
  const active = formData.get('active') === 'on';

  const issues = [
    ...validateRequired(name, 'name', 'Product name'),
    ...validateRequired(brandName, 'brandName', 'Brand name'),
    ...validateRequired(category, 'category', 'Category'),
    ...validateRequired(code, 'code', 'Product code'),
    ...validateMaxLength(name, 'name', 'Product name', 200),
    ...validateMaxLength(code, 'code', 'Product code', 100),
    ...validateMaxLength(subcategory, 'subcategory', 'Subcategory', 200),
    ...validateMaxLength(packSize, 'packSize', 'Pack size', 50),
    ...validateMaxLength(keywords, 'keywords', 'Search keywords', 500),
    ...validateSlug(brandSlug, 'brandSlug', 'Brand slug'),
    ...validatePrice(price, 'price', 'Price'),
  ];
  if (issues.length > 0) {
    return redirect('/admin/products/new?error=' + encodeURIComponent(formatIssues(issues)));
  }

  let image: string | undefined;
  try {
    image = await uploadImageIfPresent(formData, 'image', 'products');
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/products/new?error=' + encodeURIComponent(message));
  }

  await adminCreateProduct({
    name, brandName, brandSlug, category, subcategory, code, price, packSize, keywords, active,
    image: image || '',
  });

  return redirect('/admin/products?success=' + encodeURIComponent('Product created.'));
};
