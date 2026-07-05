import type { APIRoute } from 'astro';
import { adminUpdatePromotion } from '../../../../../lib/admin-data';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const formData = await request.formData();
  const { id } = params;

  if (!id) return redirect('/admin/promotions');

  const title = str(formData.get('title'));
  const subtitle = str(formData.get('subtitle'));
  const label = str(formData.get('label'));
  const background = str(formData.get('background'));
  const order = parseInt(str(formData.get('order'))) || 0;
  const active = formData.get('active') === 'on';

  if (!title) {
    return redirect(`/admin/promotions/${id}?error=` + encodeURIComponent('Title is required.'));
  }

  await adminUpdatePromotion(id, { title, subtitle, label, background, order, active });

  return redirect('/admin/promotions?success=' + encodeURIComponent('Promotion updated.'));
};
