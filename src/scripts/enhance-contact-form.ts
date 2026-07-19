type FieldErrors = Record<string, string>;

interface ErrorResponse {
  error?: string;
  fieldErrors?: FieldErrors;
}

const genericError = "We couldn't submit your request. Your information is still here, so you can correct any highlighted fields and try again.";

function getControl(form: HTMLFormElement, name: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
  const control = form.elements.namedItem(name);
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement
    ? control
    : null;
}

function fieldLabel(form: HTMLFormElement, control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string {
  const label = control.id ? form.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(control.id)}"]`) : null;
  return label?.textContent?.replace('*', '').trim() || control.name;
}

function clientErrors(form: HTMLFormElement): FieldErrors {
  const errors: FieldErrors = {};
  const controls = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not([type="hidden"]), select, textarea');

  for (const control of controls) {
    if (!control.name || control.disabled) continue;
    const value = control.value.trim();
    const label = fieldLabel(form, control);

    if (control.required && !value) {
      errors[control.name] = `${label} is required.`;
    } else if (control instanceof HTMLInputElement && control.type === 'email' && value && control.validity.typeMismatch) {
      errors[control.name] = 'Enter a valid email address.';
    } else if (
      (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)
      && control.minLength > 0
      && value.length < control.minLength
    ) {
      errors[control.name] = `${label} must be at least ${control.minLength} characters.`;
    }
  }

  return errors;
}

function clearErrors(form: HTMLFormElement): void {
  form.querySelectorAll<HTMLElement>('[data-field-error]').forEach((error) => error.remove());
  form.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((control) => {
    control.removeAttribute('aria-invalid');
    const errorId = control.id ? `${control.id}-error` : '';
    const describedBy = (control.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (describedBy.length) control.setAttribute('aria-describedby', describedBy.join(' '));
    else control.removeAttribute('aria-describedby');
  });
}

function showErrors(form: HTMLFormElement, errors: FieldErrors, detail?: string): void {
  clearErrors(form);
  const summary = form.querySelector<HTMLElement>('[data-form-errors]');
  const list = summary?.querySelector<HTMLUListElement>('[data-error-list]');
  const detailElement = summary?.querySelector<HTMLElement>('[data-error-detail]');
  if (!summary || !list || !detailElement) return;

  list.replaceChildren();
  detailElement.textContent = detail || genericError;

  for (const [name, message] of Object.entries(errors)) {
    const control = getControl(form, name);
    if (!control || !control.id) continue;

    const errorId = `${control.id}-error`;
    const error = document.createElement('p');
    error.id = errorId;
    error.className = 'field-error';
    error.dataset.fieldError = '';
    error.textContent = message;
    control.insertAdjacentElement('afterend', error);
    control.setAttribute('aria-invalid', 'true');
    const describedBy = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    describedBy.add(errorId);
    control.setAttribute('aria-describedby', [...describedBy].join(' '));

    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#${control.id}`;
    link.textContent = message;
    item.append(link);
    list.append(item);
  }

  list.hidden = list.childElementCount === 0;
  summary.hidden = false;
  summary.focus();
}

function setSubmitting(form: HTMLFormElement, submitting: boolean): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.defaultContent) button.dataset.defaultContent = button.innerHTML;
  button.disabled = submitting;
  button.setAttribute('aria-disabled', String(submitting));
  button.innerHTML = submitting
    ? `<span class="submit-spinner" aria-hidden="true"></span>${form.dataset.pendingLabel || 'Submitting...'}`
    : button.dataset.defaultContent;
}

export function enhanceContactForms(): void {
  document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach((form) => {
    if (form.dataset.enhanced === 'true') return;
    form.dataset.enhanced = 'true';
    form.noValidate = true;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearErrors(form);
      const summary = form.querySelector<HTMLElement>('[data-form-errors]');
      if (summary) summary.hidden = true;

      const validationErrors = clientErrors(form);
      if (Object.keys(validationErrors).length) {
        showErrors(form, validationErrors);
        return;
      }

      setSubmitting(form, true);
      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });

        if (response.ok && response.redirected) {
          window.location.assign(response.url);
          return;
        }

        if (response.ok) {
          const formType = getControl(form, 'form_type')?.value;
          window.location.assign(formType === 'quote' ? '/request-quote?success=true' : '/contact?success=true');
          return;
        }

        const body = await response.json().catch(() => ({})) as ErrorResponse;
        showErrors(form, body.fieldErrors || {}, body.error || genericError);
      } catch {
        showErrors(form, {}, genericError);
      } finally {
        setSubmitting(form, false);
      }
    });
  });
}

enhanceContactForms();
