import type { APIRoute } from 'astro';
import { adminUpdateSiteContent } from '../../../../lib/admin-data';
import { validateMaxLength, formatIssues } from '../../../../lib/admin-validation';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const patch: Record<string, string> = {
    heroTagline: str(formData.get('heroTagline')),
    heroSubtext: str(formData.get('heroSubtext')),
    aboutHeading: str(formData.get('aboutHeading')),
    aboutSubtext: str(formData.get('aboutSubtext')),
  };

  const issues = [
    ...validateMaxLength(patch.heroTagline, 'heroTagline', 'Hero tagline', 300),
    ...validateMaxLength(patch.heroSubtext, 'heroSubtext', 'Hero paragraph', 5000),
    ...validateMaxLength(patch.aboutHeading, 'aboutHeading', '"Built on Trust" heading', 300),
    ...validateMaxLength(patch.aboutSubtext, 'aboutSubtext', '"Built on Trust" paragraph', 5000),
  ];
  if (issues.length > 0) {
    return redirect('/admin/site-content?error=' + encodeURIComponent(formatIssues(issues)));
  }

  try {
    const homeHeroImage = await uploadImageIfPresent(formData, 'homeHeroImage', 'site-content');
    if (homeHeroImage) patch.homeHeroImage = homeHeroImage;

    const partnerImage = await uploadImageIfPresent(formData, 'partnerImage', 'site-content');
    if (partnerImage) patch.partnerImage = partnerImage;

    const brandsPageHero = await uploadImageIfPresent(formData, 'brandsPageHero', 'site-content');
    if (brandsPageHero) patch.brandsPageHero = brandsPageHero;
  } catch (err) {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'site_content_image_upload_failed',
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }));
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/site-content?error=' + encodeURIComponent(message));
  }

  await adminUpdateSiteContent(patch);

  return redirect('/admin/site-content?success=' + encodeURIComponent('Site content updated.'));
};
