import type { APIRoute } from 'astro';
import { adminCreateFAQ } from '../../../../lib/admin-data';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const question = str(formData.get('question'));
  const answer = str(formData.get('answer'));
  const order = parseInt(str(formData.get('order'))) || 0;
  const active = formData.get('active') === 'on';

  if (!question || !answer) {
    return redirect('/admin/faqs/new?error=' + encodeURIComponent('Question and Answer are required.'));
  }

  await adminCreateFAQ({ question, answer, order, active });

  return redirect('/admin/faqs?success=' + encodeURIComponent('FAQ created.'));
};
