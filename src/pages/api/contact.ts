import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData();
  const name = formData.get('name');
  const email = formData.get('email');
  const message = formData.get('message');
  
  // Here we would typically send an email via Resend, SendGrid, etc.
  // or save to Wix CRM / database.
  console.log('Received contact form submission:', { name, email, message });

  // Redirect back to contact page with a success query parameter
  return redirect('/contact?success=true');
};
