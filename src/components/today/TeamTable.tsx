import type { TeamRow } from "@/server/today";
import styles from "./today.module.scss";

/** The Admins' Team tab (F08, R8): where each person's day stands. */
export function TeamTable({ rows }: { rows: TeamRow[] }) {
  if (rows.length === 0) return <p className={styles.muted}>No active users.</p>;
  const num = (n: number, alert = false) => (
    <td className={styles.number}>
      {alert && n > 0 ? <span className={styles.alert}>{n}</span> : n}
    </td>
  );
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label="Team today">
        <thead>
          <tr>
            <th>Person</th>
            <th className={styles.number}>Due today</th>
            <th className={styles.number}>Overdue</th>
            <th className={styles.number}>Done today</th>
            <th className={styles.number}>On active plans</th>
            <th className={styles.number}>Replies waiting over 1 day</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.userId}>
              <td>
                {r.name}
                {r.role === "Admin" ? " (Admin)" : ""}
              </td>
              {num(r.dueToday)}
              {num(r.overdue, true)}
              {num(r.doneToday)}
              {num(r.inPlans)}
              {num(r.repliesWaiting, true)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
