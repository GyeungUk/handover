import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label?: ReactNode;
  /** Marks the label and, with `Input`/`Select`/`Textarea`, the control. */
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (id: string) => ReactNode;
};

/**
 * Label, control, hint, error — wired together.
 *
 * The child is a function so the generated id reaches the control without the
 * call site inventing one: `htmlFor`, `aria-describedby` and `aria-invalid` are
 * all derived from it. The old forms used a wrapping `<label>` with the input
 * inside, which works for a click target but leaves the hint and the error
 * unannounced.
 */
export default function Field({ label, required, hint, error, className = '', children }: FieldProps) {
  const id = useId();
  return (
    <div className={`ui-field ${error ? 'invalid' : ''} ${className}`}>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
          {required && <em aria-hidden="true">*</em>}
        </label>
      )}
      {children(id)}
      {hint && !error && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${id}-error`} role="alert">{error}</span>}
    </div>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`} {...rest} />;
}

export function Textarea({ className = '', rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`ui-textarea ${className}`} rows={rows} {...rest} />;
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`ui-select ${className}`} {...rest}>{children}</select>;
}
