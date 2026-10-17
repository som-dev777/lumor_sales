"use client";

import { Plus } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import fieldStyles from "./TextField.module.scss";
import styles from "./CheckboxGroup.module.scss";

type Props = {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
  /** Show an "Add another" box so people can add their own option. */
  allowCustom?: boolean;
};

/** Tick any number of options (e.g. a persona's functions), and optionally add new ones. */
export function CheckboxGroup({
  label,
  options,
  value,
  onChange,
  error,
  allowCustom = false,
}: Props) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  // Options already ticked but not in the list (e.g. added just now) are shown too.
  const shown = [...options, ...value.filter((v) => !options.includes(v))];

  function addCustom() {
    const option = draft.trim().slice(0, 40);
    if (option) {
      const existing = shown.find((o) => o.toLowerCase() === option.toLowerCase());
      const pick = existing ?? option;
      if (!value.includes(pick)) onChange([...value, pick]);
    }
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault(); // don't submit the whole form
      addCustom();
    }
  }

  return (
    <fieldset className={styles.group}>
      <legend className={fieldStyles.label}>{label}</legend>
      <div className={styles.options}>
        {shown.map((option) => {
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
      {allowCustom && (
        <div className={styles.addRow}>
          <label htmlFor={inputId} className={styles.srOnly}>
            Add another {label.toLowerCase()}
          </label>
          <input
            id={inputId}
            className={styles.addInput}
            value={draft}
            maxLength={40}
            placeholder={`Add another ${label.toLowerCase()}…`}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className={styles.addButton}
            onClick={addCustom}
            disabled={!draft.trim()}
          >
            <Plus size={14} aria-hidden />
            Add
          </button>
        </div>
      )}
      {error && (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
