import type { APIRoute } from 'astro';
import { adminUpdateProduct } from '../../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateSlug, validatePrice, formatIssues } from '../../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../../lib/admin-upload';
import { isPriceBasis } from '../../../../../lib/product-pricing';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const brandName = str(formData.get('brandName'));
  const brandSlug = str(formData.get('brandSlug'));
  const category = str(formData.get('category'));
  const subcategory = str(formData.get('subcategory'));
  const code = str(formData.get('code'));
  const price = str(formData.get('price'));
  const priceBasisValue = str(formData.get('priceBasis'));
  const packSize = str(formData.get('packSize'));
  const keywords = str(formData.get('keywords'));
  const active = formData.get('active') === 'on';
  const currentImage = str(formData.get('currentImage'));

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
    ...(!isPriceBasis(priceBasisValue) ? [{ field: 'priceBasis', message: 'Price basis must be per case, pack, unit, or indicative.' }] : []),
  ];
  if (issues.length > 0) {
    return redirect(`/admin/products/${id}?error=` + encodeURIComponent(formatIssues(issues)));
  }

  let image = currentImage;
  try {
    const uploaded = await uploadImageIfPresent(formData, 'image', 'products');
    if (uploaded) image = uploaded;
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect(`/admin/products/${id}?error=` + encodeURIComponent(message));
  }

  await adminUpdateProduct(id, {
    name, brandName, brandSlug, category, subcategory, code, price, priceBasis: priceBasisValue as 'case' | 'pack' | 'unit' | 'indicative', packSize, keywords, active, image,
  });

  return redirect('/admin/products?success=' + encodeURIComponent('Product updated.'));
};
