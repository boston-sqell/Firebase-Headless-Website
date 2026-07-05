import type { APIRoute } from 'astro';
import { adminUpdateFAQ } from '../../../../../lib/admin-data';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, params, redirect }) => {
  const formData = await request.formData();
  const { id } = params;

  if (!id) return redirect('/admin/faqs');

  const question = str(formData.get('question'));
  const answer = str(formData.get('answer'));
  const order = parseInt(str(formData.get('order'))) || 0;
  const active = formData.get('active') === 'on';

  if (!question || !answer) {
    return redirect(`/admin/faqs/${id}?error=` + encodeURIComponent('Question and Answer are required.'));
  }

  await adminUpdateFAQ(id, { question, answer, order, active });

  return redirect('/admin/faqs?success=' + encodeURIComponent('FAQ updated.'));
};
