export type ContactFormType = 'contact' | 'quote';

export interface ContactFormValues {
  formType: ContactFormType;
  name: string;
  email: string;
  phone: string;
  company: string;
  message: string;
  businessType: string;
  islandAtoll: string;
  productName: string;
  brandName: string;
  expectedVolume: string;
}

export type ContactFieldErrors = Partial<Record<keyof Omit<ContactFormValues, 'formType'>, string>>;

export function validateContactSubmission(values: ContactFormValues): ContactFieldErrors {
  const errors: ContactFieldErrors = {};

  if (!values.name) errors.name = 'Full name is required.';
  if (!values.email) {
    errors.email = 'Email address is required.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (!values.phone) errors.phone = 'Phone number is required.';

  if (values.formType === 'quote') {
    if (!values.businessType) errors.businessType = 'Business type is required.';
    if (!values.islandAtoll) errors.islandAtoll = 'Delivery location is required.';
    if (!values.productName) errors.productName = 'Product of interest is required.';
    if (!values.expectedVolume) errors.expectedVolume = 'Expected order volume is required.';
    if (!values.company) errors.company = 'Business or shop name is required.';
  } else {
    if (!values.message) {
      errors.message = 'Message is required.';
    } else if (values.message.length < 10) {
      errors.message = 'Message must be at least 10 characters.';
    }
  }

  return errors;
}
