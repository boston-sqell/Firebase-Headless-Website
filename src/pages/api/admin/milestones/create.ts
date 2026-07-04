import type { APIRoute } from 'astro';
import { adminCreateMilestone, adminListMilestones } from '../../../../lib/admin-data';
import { validateRequired, validateMaxLength, validateOrder, formatIssues } from '../../../../lib/admin-validation';

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();

  const year = str(formData.get('year'));
  const chapter = str(formData.get('chapter'));
  const title = str(formData.get('title'));
  const body = str(formData.get('body'));
  const orderStr = str(formData.get('order'));

  const issues = [
    ...validateRequired(year, 'year', 'Year'),
    ...validateMaxLength(year, 'year', 'Year', 50),
    ...validateRequired(chapter, 'chapter', 'Chapter'),
    ...validateMaxLength(chapter, 'chapter', 'Chapter', 200),
    ...validateRequired(title, 'title', 'Title'),
    ...validateMaxLength(title, 'title', 'Title', 300),
    ...validateRequired(body, 'body', 'Body'),
    ...validateMaxLength(body, 'body', 'Body', 5000),
  ];
  if (issues.length > 0) {
    return redirect('/admin/milestones/new?error=' + encodeURIComponent(formatIssues(issues)));
  }

  let order = parseInt(orderStr, 10);
  if (Number.isNaN(order)) {
    const existing = await adminListMilestones();
    order = existing.length;
  }
  const orderIssues = validateOrder(order, 'order', 'Display order');
  if (orderIssues.length > 0) {
    return redirect('/admin/milestones/new?error=' + encodeURIComponent(formatIssues(orderIssues)));
  }

  await adminCreateMilestone({ year, chapter, title, body, order });

  return redirect('/admin/milestones?success=' + encodeURIComponent('Milestone created.'));
};
