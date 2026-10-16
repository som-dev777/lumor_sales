import { useId, type Ref, type SelectHTMLAttributes } from "react";
import fieldStyles from "./TextField.module.scss";

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly { value: string; label: string }[];
  error?: string;
  ref?: Ref<HTMLSelectElement>;
};

/** A labelled dropdown (the browser's own, so it works well on phones). */
export function SelectField({ label, options, error, id, ref, ...rest }: Props) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={selectId} className={fieldStyles.label}>
        {label}
      </label>
      <select
        id={selectId}
        ref={ref}
        className={`${fieldStyles.input} ${error ? fieldStyles.invalid : ""}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
