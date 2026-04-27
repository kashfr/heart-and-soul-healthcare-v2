import type { FieldErrors } from 'react-hook-form';
import type { FormValues } from '../types';

/**
 * Tiny presentational component for inline RHF validation errors.
 * Matches the form's existing label/typography so it sits naturally under
 * the field that produced it.
 */
export default function FieldError({
  name,
  errors,
}: {
  name: keyof FormValues;
  errors?: FieldErrors<FormValues>;
}) {
  const err = errors?.[name];
  if (!err?.message) return null;
  return (
    <span
      role="alert"
      style={{
        display: 'block',
        marginTop: 4,
        color: '#c62828',
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      {String(err.message)}
    </span>
  );
}
