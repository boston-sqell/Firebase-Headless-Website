import type { APIRoute } from 'astro';
import { adminUpdateNewsItem } from '../../../../../lib/admin-data';
import { uploadImageIfPresent, UploadError } from '../../../../../lib/admin-upload';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const formData = await request.formData();
  const { id } = params;

  if (!id) return redirect('/admin/news');

  const title = str(formData.get('title'));
  const publishedAt = str(formData.get('publishedAt'));
  const eyebrow = str(formData.get('eyebrow'));
  const emoji = str(formData.get('emoji'));
  const backgroundColor = str(formData.get('backgroundColor'));
  const description = str(formData.get('description'));
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect(`/admin/news/${id}?error=` + encodeURIComponent('Title is required.'));
  }

  let image = str(formData.get('currentImage'));
  try {
    const newImage = await uploadImageIfPresent(formData, 'image', 'news');
    if (newImage) image = newImage;
  } catch (err) {
    const message = err instanceof UploadError ? err.message : 'Image upload failed.';
    return redirect(`/admin/news/${id}?error=` + encodeURIComponent(message));
  }

  await adminUpdateNewsItem(id, {
    title, publishedAt, eyebrow, emoji, backgroundColor, description, active, image
  });

  return redirect('/admin/news?success=' + encodeURIComponent('News item updated.'));
};
