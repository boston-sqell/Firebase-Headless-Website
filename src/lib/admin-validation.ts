/**
 * Server-side field validation for the admin panel's mutating endpoints.
 *
 * Until now these endpoints only checked that "required" fields were
 * non-empty -- nothing stopped an editor (accidentally, via a broken
 * script, or via a compromised session) from writing a slug with spaces
 * that breaks /brands/<slug> routing, a price like "free" that breaks
 * anything expecting a number, or a multi-megabyte string into a field
 * meant to hold a two-line tagline. These helpers add format/length
 * checks on top of the existing required-field checks, and every admin
 * create/update route composes them the same way:
 *
 *   const issues = [
 *     ...validateRequired(name, 'name', 'Product name'),
 *     ...validateMaxLength(name, 'name', 'Product name', 200),
 *   ];
 *   if (issues.length > 0) {
 *     return redirect(errorUrl + encodeURIComponent(formatIssues(issues)));
 *   }
 */

export interface ValidationIssue {
  field: string;
  message: string;
}

// Lowercase letters, numbers, and single hyphens between segments -- e.g.
// "pascual" or "sun-fresh", but not "Sun Fresh", "sun--fresh", or "-sun".
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A plain non-negative number with up to 2 decimal places, e.g. "125" or
// "125.50". No currency symbols, commas, or ranges -- the UI already
// prefixes "MVR" and handles the "leave blank for 'Request price'" case.
const PRICE_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;

export function validateRequired(value: string, field: string, label: string): ValidationIssue[] {
  return value ? [] : [{ field, message: `${label} is required.` }];
}

export function validateMaxLength(value: string, field: string, label: string, max: number): ValidationIssue[] {
  return value.length > max
    ? [{ field, message: `${label} must be ${max} characters or fewer (got ${value.length}).` }]
    : [];
}

export function validateSlug(value: string, field: string, label: string): ValidationIssue[] {
  if (!value) return [];
  return SLUG_PATTERN.test(value)
    ? []
    : [{ field, message: `${label} must be lowercase letters, numbers, and single hyphens only (e.g. "brand-name").` }];
}

export function validatePrice(value: string, field: string, label: string): ValidationIssue[] {
  if (!value) return [];
  return PRICE_PATTERN.test(value)
    ? []
    : [{ field, message: `${label} must be a plain number like 125 or 125.50 (no currency symbols or letters).` }];
}

export function validateOrder(value: number, field: string, label: string): ValidationIssue[] {
  return Number.isInteger(value) && value >= 0 && value < 100000
    ? []
    : [{ field, message: `${label} must be a whole number between 0 and 99999.` }];
}

export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map(i => i.message).join(' ');
}
