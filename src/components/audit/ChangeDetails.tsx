import { fieldLabel, formatChangeValue } from "@/lib/audit-format";
import type { AuditChanges } from "@/lib/db/schema";
import styles from "./audit.module.scss";

/** The before → after table for one audit entry. */
export function ChangeDetails({ changes }: { changes: AuditChanges }) {
  const fields = Object.entries(changes);
  if (fields.length === 0) return <p className={styles.muted}>No field values recorded.</p>;
  return (
    <table className={styles.changes}>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {fields.map(([field, { before, after }]) => (
          <tr key={field}>
            <td>{fieldLabel(field)}</td>
            <td className={styles.before}>{formatChangeValue(before)}</td>
            <td className={styles.after}>{formatChangeValue(after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
