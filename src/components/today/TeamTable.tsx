import Link from "next/link";
import type { TeamDetail, TeamDetailRow, TeamRow } from "@/server/today";
import styles from "./today.module.scss";

const COLUMNS: { key: keyof TeamRow; show: TeamDetail; label: string; alert?: boolean }[] = [
  { key: "dueToday", show: "due", label: "Due today" },
  { key: "backlog", show: "backlog", label: "Backlog", alert: true },
  { key: "meetingsToday", show: "meetings", label: "Meetings today" },
  { key: "doneToday", show: "done", label: "Done today" },
  { key: "inPlans", show: "plans", label: "On active plans" },
  { key: "repliesWaiting", show: "replies", label: "Replies waiting over 1 day", alert: true },
];

/**
 * The Admins' Team tab (F08, R8; D-043): where each person's day stands. The numbers use the
 * same rules as each person's My day; each opens the list behind it.
 */
export function TeamTable({
  rows,
  detail,
}: {
  rows: TeamRow[];
  detail: { userId: string; show: TeamDetail; name: string; rows: TeamDetailRow[] } | null;
}) {
  if (rows.length === 0) return <p className={styles.muted}>No active users.</p>;
  const label = detail ? COLUMNS.find((c) => c.show === detail.show)!.label : "";
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Team today">
          <thead>
            <tr>
              <th>Person</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className={styles.number}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.userId}>
                <td>
                  {r.name}
                  {r.role === "Admin" ? " (Admin)" : ""}
                </td>
                {COLUMNS.map((c) => {
                  const n = r[c.key] as number;
                  const open = detail?.userId === r.userId && detail.show === c.show;
                  return (
                    <td key={c.key} className={styles.number}>
                      <Link
                        href={`/?tab=team&user=${r.userId}&show=${c.show}`}
                        scroll={false}
                        aria-label={`${c.label} for ${r.name}: ${n}`}
                        aria-current={open ? "true" : undefined}
                        className={styles.numberLink}
                      >
                        {c.alert && n > 0 ? <span className={styles.alert}>{n}</span> : n}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <section className={styles.detailPanel} aria-label={`${label}: ${detail.name}`}>
          <h2 className={styles.sectionTitle}>
            {label}: {detail.name} <span className={styles.badge}>{detail.rows.length}</span>{" "}
            <Link href="/?tab=team" scroll={false} className={styles.muted}>
              Close
            </Link>
          </h2>
          {detail.rows.length === 0 ? (
            <p className={styles.muted}>Nothing here.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>What</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((d, i) => (
                    <tr key={`${d.personId}-${i}`}>
                      <td>
                        {d.personId ? <Link href={`/people/${d.personId}`}>{d.name}</Link> : d.name}
                      </td>
                      <td>{d.what}</td>
                      <td>{d.when ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
