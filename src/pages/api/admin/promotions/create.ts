import type { APIRoute } from 'astro';
import { adminCreatePromotion } from '../../../../lib/admin-data';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const title = str(formData.get('title'));
  const subtitle = str(formData.get('subtitle'));
  const label = str(formData.get('label'));
  const background = str(formData.get('background'));
  const order = parseInt(str(formData.get('order'))) || 0;
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect('/admin/promotions/new?error=' + encodeURIComponent('Title is required.'));
  }

  await adminCreatePromotion({ title, subtitle, label, background, order, active });

  return redirect('/admin/promotions?success=' + encodeURIComponent('Promotion created.'));
};
