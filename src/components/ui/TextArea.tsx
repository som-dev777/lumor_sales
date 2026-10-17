import { useId, type Ref, type TextareaHTMLAttributes } from "react";
import fieldStyles from "./TextField.module.scss";
import styles from "./TextArea.module.scss";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLTextAreaElement>;
};

/** A labelled multi-line text box. */
export function TextArea({ label, error, hint, id, rows = 3, ref, ...rest }: Props) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={inputId} className={fieldStyles.label}>
        {label}
      </label>
      <textarea
        id={inputId}
        ref={ref}
        rows={rows}
        className={`${fieldStyles.input} ${styles.area} ${error ? fieldStyles.invalid : ""}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
      {hint && !error && <p className={fieldStyles.hint}>{hint}</p>}
      {error && (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
