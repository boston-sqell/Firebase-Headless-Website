import type { APIRoute } from 'astro';
import { adminDeleteMilestone } from '../../../../../lib/admin-data';

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id!;
  await adminDeleteMilestone(id);
  return redirect('/admin/milestones?success=' + encodeURIComponent('Milestone deleted.'));
};
