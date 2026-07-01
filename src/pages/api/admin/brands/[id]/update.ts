import type { APIRoute } from 'astro';
import { adminUpdateBrand } from '../../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateSlug, formatIssues } from '../../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const formData = await request.formData();

  const name = str(formData.get('name'));
  const slug = str(formData.get('slug'));
  const description = str(formData.get('description'));
  const active = formData.get('active') === 'on';
  const currentLogo = str(formData.get('currentLogo'));
  const currentHeroImage = str(formData.get('currentHeroImage'));

  const issues = [
    ...validateRequired(name, 'name', 'Brand name'),
    ...validateRequired(slug, 'slug', 'Slug'),
    ...validateMaxLength(name, 'name', 'Brand name', 200),
    ...validateSlug(slug, 'slug', 'Slug'),
    ...validateMaxLength(description, 'description', 'Description', 5000),
  ];
  if (issues.length > 0) {
    return redirect(`/admin/brands/${id}?error=` + encodeURIComponent(formatIssues(issues)));
  }

  let logo = currentLogo;
  let heroImage = currentHeroImage;
  try {
    const uploadedLogo = await uploadImageIfPresent(formData, 'logo', 'brands/logos');
    if (uploadedLogo) logo = uploadedLogo;
    const uploadedHero = await uploadImageIfPresent(formData, 'heroImage', 'brands/heroes');
    if (uploadedHero) heroImage = uploadedHero;
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect(`/admin/brands/${id}?error=` + encodeURIComponent(message));
  }

  await adminUpdateBrand(id, { name, slug, description, active, logo, heroImage });

  return redirect('/admin/brands?success=' + encodeURIComponent('Brand updated.'));
};
