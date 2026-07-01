import type { APIRoute } from 'astro';
import { adminCreateBrand } from '../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateSlug, formatIssues } from '../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

function slugify(v: string): string {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const slug = str(formData.get('slug')) || slugify(name);
  const description = str(formData.get('description'));
  const active = formData.get('active') === 'on';

  const issues = [
    ...validateRequired(name, 'name', 'Brand name'),
    ...validateMaxLength(name, 'name', 'Brand name', 200),
    ...validateSlug(slug, 'slug', 'Slug'),
    ...validateMaxLength(description, 'description', 'Description', 5000),
  ];
  if (issues.length > 0) {
    return redirect('/admin/brands/new?error=' + encodeURIComponent(formatIssues(issues)));
  }

  let logo: string | undefined;
  let heroImage: string | undefined;
  try {
    logo = await uploadImageIfPresent(formData, 'logo', 'brands/logos');
    heroImage = await uploadImageIfPresent(formData, 'heroImage', 'brands/heroes');
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/brands/new?error=' + encodeURIComponent(message));
  }

  await adminCreateBrand({ name, slug, description, active, logo: logo || '', heroImage: heroImage || '' });

  return redirect('/admin/brands?success=' + encodeURIComponent('Brand created.'));
};
