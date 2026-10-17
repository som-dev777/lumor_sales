import type { ItemStats } from "@/server/library/stats";
import styles from "./library.module.scss";

const percent = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

/** Leads · Replied · Demos · Paid · Reply rate, counting only this item's own leads. */
export function StatsRow({ stats }: { stats: ItemStats }) {
  const cells = [
    ["Leads", stats.leads],
    ["Replied", stats.replied],
    ["Demos", stats.demos],
    ["Paid", stats.paid],
    ["Reply rate", percent(stats.replyRate)],
  ] as const;
  return (
    <div className={styles.stats}>
      {cells.map(([label, value]) => (
        <div key={label} className={styles.stat}>
          <span className={styles.statValue}>{value}</span>
          <span className={styles.statLabel}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export { percent };
