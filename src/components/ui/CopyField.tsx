"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "./Button";
import styles from "./CopyField.module.scss";

/** A read-only box with a Copy button, for invite and reset links. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is still selectable in the box.
    }
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <input
          className={styles.input}
          value={value}
          readOnly
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
