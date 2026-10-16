import { getDb } from "@/lib/db/client";
import { formatIst } from "@/lib/time";
import { historyFor } from "@/server/audit-query";
import { ChangeDetails } from "./ChangeDetails";
import styles from "./audit.module.scss";

/**
 * A record's own change history, read from the Audit Log. Shown on detail pages from R2
 * (persona, filter, template, person, company). Everyone can see it; only Admins see the
 * full Audit Log. Render it inside <Suspense> and after requireUser().
 */
export async function ChangeHistory({
  entityType,
  recordId,
}: {
  entityType: string;
  recordId: string;
}) {
  const entries = await historyFor(getDb(), entityType, recordId);
  return (
    <section className={styles.history}>
      <h2 className={styles.historyTitle}>Change history</h2>
      {entries.length === 0 ? (
        <p className={styles.muted}>No changes recorded yet.</p>
      ) : (
        <ol className={styles.historyList}>
          {entries.map((e) => (
            <li key={e.id} className={styles.historyItem}>
              <p className={styles.historyMeta}>
                <strong>{e.action}</strong> by {e.userName ?? "System"} · {formatIst(e.occurredAt)}
              </p>
              <ChangeDetails changes={e.changes} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
