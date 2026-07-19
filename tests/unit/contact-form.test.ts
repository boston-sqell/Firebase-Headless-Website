import { describe, expect, it } from 'vitest';
import { validateContactSubmission, type ContactFormValues } from '../../src/lib/contact-form';

const validContact: ContactFormValues = {
  formType: 'contact',
  name: 'Aishath Ali',
  email: 'aishath@example.com',
  phone: '+960 777-0000',
  company: '',
  message: 'I would like more information.',
  businessType: '',
  islandAtoll: '',
  productName: '',
  brandName: '',
  expectedVolume: '',
};

describe('validateContactSubmission', () => {
  it('accepts a complete general enquiry', () => {
    expect(validateContactSubmission(validContact)).toEqual({});
  });

  it('returns field-addressable errors for an invalid general enquiry', () => {
    expect(validateContactSubmission({
      ...validContact,
      name: '',
      email: 'not-an-email',
      phone: '',
      message: 'Short',
    })).toEqual({
      name: 'Full name is required.',
      email: 'Enter a valid email address.',
      phone: 'Phone number is required.',
      message: 'Message must be at least 10 characters.',
    });
  });

  it('requires the procurement fields for quote requests', () => {
    expect(validateContactSubmission({
      ...validContact,
      formType: 'quote',
      company: '',
      message: '',
    })).toEqual({
      businessType: 'Business type is required.',
      islandAtoll: 'Delivery location is required.',
      productName: 'Product of interest is required.',
      expectedVolume: 'Expected order volume is required.',
      company: 'Business or shop name is required.',
    });
  });
});
