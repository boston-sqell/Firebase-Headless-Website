import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, redirect }) => {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const allowedOrigin = 'https://sosun-fihaara.com'; // Adjust for production domain

  if (origin && !origin.includes(allowedOrigin) && referer && !referer.includes(allowedOrigin)) {
    return new Response(JSON.stringify({ error: 'Unauthorized request origin' }), { status: 403 });
  }

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
