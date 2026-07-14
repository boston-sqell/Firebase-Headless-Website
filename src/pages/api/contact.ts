import type { APIRoute } from 'astro';
import { isAllowedOrigin } from '../../lib/origins';
import { createContactSubmission, adminGetSiteContent, getDb } from '../../lib/admin-data';
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

  const name         = sanitizeString(formData.get('name'), 100);
  const email        = sanitizeString(formData.get('email'), 254);
  const phone        = sanitizeString(formData.get('phone'), 30);
  const company      = sanitizeString(formData.get('company'), 150);
  const message      = sanitizeString(formData.get('message'), 2000);
  const businessType = sanitizeString(formData.get('businessType'), 100);
  const islandAtoll  = sanitizeString(formData.get('islandAtoll'), 100);
  const productName  = sanitizeString(formData.get('productName'), 200);
  const brandName    = sanitizeString(formData.get('brandName'), 200);
  const expectedVolume = sanitizeString(formData.get('expectedVolume'), 200);
  const formType     = sanitizeString(formData.get('form_type'), 20) || 'contact';

  const errors: string[] = [];
  if (!name)                          errors.push('Name is required.');
  if (!email)                         errors.push('Email is required.');
  if (email && !validateEmail(email)) errors.push('Email address is not valid.');
  if (!phone)                         errors.push('Phone is required.');

  if (formType === 'quote') {
    if (!businessType)                errors.push('Business type is required.');
    if (!islandAtoll)                 errors.push('Delivery location is required.');
    if (!productName)                 errors.push('Product of interest is required.');
    if (!expectedVolume)              errors.push('Expected order volume is required.');
    if (!company)                     errors.push('Business / Shop Name is required.');
  } else {
    if (!message)                     errors.push('Message is required.');
    if (message && message.length < 10) errors.push('Message must be at least 10 characters.');
  }

  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join(' ') }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await createContactSubmission({
      name,
      email,
      phone,
      company,
      message,
      businessType: businessType || undefined,
      islandAtoll: islandAtoll || undefined,
      productName: productName || undefined,
      brandName: brandName || undefined,
      expectedVolume: expectedVolume || undefined
    });
    
    // Check if email alerts are configured
    const site = await adminGetSiteContent();
    if (site.alertEmail) {
      const isQuote = formType === 'quote';
      const subject = isQuote ? `New B2B Quote Request from ${name}` : `New Contact Form Submission from ${name}`;
      const htmlContent = isQuote ? `
        <h2>New B2B Quote Request</h2>
        <p><strong>Business Type:</strong> ${businessType}</p>
        <p><strong>Delivery Location:</strong> ${islandAtoll}</p>
        <p><strong>Product of Interest:</strong> ${productName}</p>
        <p><strong>Brand of Interest:</strong> ${brandName || 'N/A'}</p>
        <p><strong>Expected Volume:</strong> ${expectedVolume}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Business/Company:</strong> ${company}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Notes/Details:</strong><br/>${message.replace(/\n/g, '<br/>') || 'N/A'}</p>
      ` : `
        <h2>New Contact Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Company:</strong> ${company || 'N/A'}</p>
        <p><strong>Message:</strong><br/>${message.replace(/\n/g, '<br/>')}</p>
      `;
      await getDb().collection('mail').add({
        to: site.alertEmail,
        message: {
          subject,
          html: htmlContent,
        }
      });
    }
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
    formType,
  }));

  if (formType === 'quote') {
    return redirect('/request-quote?success=true');
  } else {
    return redirect('/contact?success=true');
  }
};
