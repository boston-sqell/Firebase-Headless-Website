import type { APIRoute } from 'astro';
import { isAllowedOrigin } from '../../lib/origins';
import { createContactSubmission } from '../../lib/admin-data';
import { isAllowed, getClientKey } from '../../lib/rate-limit';

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeString(value: FormDataEntryValue | null, maxLength: number): string {
  if (!value || typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const origin = request.headers.get('origin');
  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!isAllowed(`contact:${getClientKey(request)}`, 5, 10 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many submissions. Please try again later.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const honeypot = sanitizeString(formData.get('website'), 200);
  if (honeypot) {
    return redirect('/contact?success=true');
  }

  const name    = sanitizeString(formData.get('name'), 100);
  const email   = sanitizeString(formData.get('email'), 254);
  const phone   = sanitizeString(formData.get('phone'), 30);
  const company = sanitizeString(formData.get('company'), 150);
  const message = sanitizeString(formData.get('message'), 2000);

  const errors: string[] = [];
  if (!name)                          errors.push('Name is required.');
  if (!email)                         errors.push('Email is required.');
  if (email && !validateEmail(email)) errors.push('Email address is not valid.');
  if (!message)                       errors.push('Message is required.');
  if (message.length < 10)            errors.push('Message must be at least 10 characters.');

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(' ') }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await createContactSubmission({ name, email, phone, company, message });
  } catch (err) {
    console.error(JSON.stringify({ severity: 'ERROR', message: 'contact_submission_failed', error: String(err) }));
    return new Response(JSON.stringify({ error: 'Something went wrong. Please try again or call us directly.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'contact_submission_received',
    emailDomain: email.split('@')[1] || 'unknown',
  }));

  return redirect('/contact?success=true');
};
