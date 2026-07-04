import type { APIRoute } from 'astro';
import { adminUpdateMilestone } from '../../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateOrder, formatIssues } from '../../../../../lib/admin-validation';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const formData = await request.formData();

  const year = str(formData.get('year'));
  const chapter = str(formData.get('chapter'));
  const title = str(formData.get('title'));
  const body = str(formData.get('body'));
  const order = parseInt(str(formData.get('order')), 10) || 0;

  const issues = [
    ...validateRequired(year, 'year', 'Year'),
    ...validateMaxLength(year, 'year', 'Year', 50),
    ...validateRequired(chapter, 'chapter', 'Chapter'),
    ...validateMaxLength(chapter, 'chapter', 'Chapter', 200),
    ...validateRequired(title, 'title', 'Title'),
    ...validateMaxLength(title, 'title', 'Title', 300),
    ...validateRequired(body, 'body', 'Body'),
    ...validateMaxLength(body, 'body', 'Body', 5000),
    ...validateOrder(order, 'order', 'Display order'),
  ];
  if (issues.length > 0) {
    return redirect(`/admin/milestones/${id}?error=` + encodeURIComponent(formatIssues(issues)));
  }

  await adminUpdateMilestone(id, { year, chapter, title, body, order });

  return redirect('/admin/milestones?success=' + encodeURIComponent('Milestone updated.'));
};
