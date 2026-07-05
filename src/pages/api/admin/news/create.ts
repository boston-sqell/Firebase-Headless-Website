import type { APIRoute } from 'astro';
import { adminCreateNewsItem } from '../../../../lib/admin-data';
import { uploadImageIfPresent, UploadError } from '../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const title = str(formData.get('title'));
  const publishedAt = str(formData.get('publishedAt'));
  const eyebrow = str(formData.get('eyebrow'));
  const emoji = str(formData.get('emoji'));
  const backgroundColor = str(formData.get('backgroundColor'));
  const description = str(formData.get('description'));
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect('/admin/news/new?error=' + encodeURIComponent('Title is required.'));
  }

  let image: string | undefined;
  try {
    image = await uploadImageIfPresent(formData, 'image', 'news');
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect('/admin/news/new?error=' + encodeURIComponent(message));
  }

  await adminCreateNewsItem({
    title, publishedAt, eyebrow, emoji, backgroundColor, description, active,
    image: image || '',
  });

  return redirect('/admin/news?success=' + encodeURIComponent('News item created.'));
};
