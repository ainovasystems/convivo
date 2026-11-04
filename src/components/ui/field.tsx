import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const inputClass =
  "block w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted " +
  "focus:border-brand focus:outline-2 focus:outline-offset-1 focus:outline-brand aria-[invalid=true]:border-red-600";

type BaseProps = { id: string; label: string; error?: string; hint?: ReactNode; children?: ReactNode };

function Wrapper({ id, label, error, hint, children }: BaseProps) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({
  id,
  label,
  error,
  hint,
  ...props
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      />
    </Wrapper>
  );
}

export function TextAreaField({
  id,
  label,
  error,
  hint,
  ...props
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      />
    </Wrapper>
  );
}

export function SelectField({
  id,
  label,
  error,
  hint,
  options,
  placeholder = "Sin indicar",
  ...props
}: BaseProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
    options: ReadonlyArray<{ value: string; label: string }>;
    placeholder?: string;
  }) {
  return (
    <Wrapper id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        name={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}
