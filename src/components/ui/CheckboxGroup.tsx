import fieldStyles from "./TextField.module.scss";
import styles from "./CheckboxGroup.module.scss";

type Props<T extends string> = {
  label: string;
  options: readonly T[];
  value: T[];
  onChange: (value: T[]) => void;
  error?: string;
};

/** Tick any number of options (e.g. a persona's functions). */
export function CheckboxGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: Props<T>) {
  return (
    <fieldset className={styles.group}>
      <legend className={fieldStyles.label}>{label}</legend>
      <div className={styles.options}>
        {options.map((option) => {
          const checked = value.includes(option);
          return (
            <label key={option} className={`${styles.option} ${checked ? styles.checked : ""}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((v) => v !== option) : [...value, option])
                }
              />
              {option}
            </label>
          );
        })}
      </div>
      {error && (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
