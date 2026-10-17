"use client";

import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import fieldStyles from "./TextField.module.scss";
import styles from "./TagInput.module.scss";

type Props = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
};

/** A list of short entries: type one and press Enter (or comma) to add it; × removes it. */
export function TagInput({ label, value, onChange, placeholder, hint, error }: Props) {
  const id = useId();
  const [draft, setDraft] = useState("");

  function add(text: string) {
    const entry = text.trim().replace(/,$/, "").trim();
    if (entry && !value.includes(entry)) onChange([...value, entry]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <div className={`${styles.box} ${error ? fieldStyles.invalid : ""}`}>
        {value.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          className={styles.input}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && add(draft)}
        />
      </div>
      {hint && !error && <p className={fieldStyles.hint}>{hint}</p>}
      {error && (
        <p className={fieldStyles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
