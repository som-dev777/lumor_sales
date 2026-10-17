import { fieldLabel, formatChangeValue, meaningfulChanges, type NameMap } from "@/lib/audit-format";
import type { AuditChanges } from "@/lib/db/schema";
import styles from "./audit.module.scss";

/** The before → after table for one audit entry. */
export function ChangeDetails({ changes, names = {} }: { changes: AuditChanges; names?: NameMap }) {
  const fields = meaningfulChanges(changes);
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
            <td className={styles.before}>{formatChangeValue(before, names)}</td>
            <td className={styles.after}>{formatChangeValue(after, names)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
