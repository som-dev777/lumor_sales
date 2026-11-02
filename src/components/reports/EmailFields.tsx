"use client";

import { TextField } from "@/components/ui/TextField";
import styles from "./reports.module.scss";

/** Email to (D-043): teammates to tick, and any other addresses. */
export function EmailFields({
  teammates,
  shareWith,
  setShareWith,
  emails,
  setEmails,
  error,
}: {
  teammates: { id: string; name: string }[];
  shareWith: string[];
  setShareWith: (ids: string[]) => void;
  emails: string;
  setEmails: (v: string) => void;
  error?: string;
}) {
  return (
    <fieldset className={styles.stack}>
      <legend className={styles.cardTitle}>Email to (optional)</legend>
      {teammates.length > 0 && (
        <div className={styles.checkGrid} role="group" aria-label="Teammates">
          {teammates.map((m) => (
            <label key={m.id}>
              <input
                type="checkbox"
                checked={shareWith.includes(m.id)}
                onChange={(e) =>
                  setShareWith(
                    e.target.checked ? [...shareWith, m.id] : shareWith.filter((x) => x !== m.id),
                  )
                }
              />
              {m.name}
            </label>
          ))}
        </div>
      )}
      <TextField
        label="Other email addresses"
        placeholder="manager@lumor.tech, investor@fund.com"
        hint="Comma separated. Everyone gets the PDF; teammates can also open it in the Sales Hub."
        inputMode="email"
        value={emails}
        onChange={(e) => setEmails(e.target.value)}
        error={error}
      />
    </fieldset>
  );
}
