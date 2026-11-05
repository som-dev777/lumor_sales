import Link from "next/link";
import { formatIstDate } from "@/lib/time";
import { SECTIONS } from "@/lib/today-sections";
import type { DayView as Day } from "@/server/today";
import { LoggedList } from "./LoggedList";
import styles from "./today.module.scss";

/**
 * Another day on Today (D-057): a day ahead shows what falls due then; a day back shows what was
 * due then and is still open, and what you logged that day. Open someone to work on them.
 */
export function DayView({ view, today }: { view: Day; today: string }) {
  const label = formatIstDate(view.day, "EEEE d MMMM");
  const groups = SECTIONS.map((s) => ({
    ...s,
    items: view.tasks.filter((t) => (t.origin ?? t.section) === s.key),
  })).filter((g) => g.items.length > 0);
  return (
    <>
      <section
        className={styles.section}
        aria-label={view.ahead ? `Due on ${label}` : `Still open from ${label}`}
      >
        <h2 className={styles.sectionTitle}>
          {view.ahead ? `Due on ${label}` : `Due on ${label} and still open`}{" "}
          <span className={styles.badge}>{view.tasks.length}</span>
        </h2>
        {view.tasks.length === 0 ? (
          <p className={styles.muted}>
            {view.ahead
              ? "Nothing falls due that day yet."
              : "Nothing from that day is still open."}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.key}>
              <h3 className={styles.dayGroup}>{g.label}</h3>
              <ul className={styles.list}>
                {g.items.map((t) => (
                  <li key={t.id} className={styles.task} aria-label={t.name}>
                    <div className={styles.taskMain}>
                      <Link href={`/people/${t.personId}`} className={styles.taskName}>
                        {t.name}
                      </Link>
                      <span className={styles.muted}>
                        {[t.title, t.company].filter(Boolean).join(" · ")}
                        {t.planName ? ` · ${t.planName}` : ""}
                      </span>
                      <span className={styles.detail}>{t.detail}</span>
                    </div>
                    <div className={styles.taskActions}>
                      <Link href={`/people/${t.personId}`} className={styles.linkButton}>
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      {!view.ahead && <LoggedList title={`Done on ${label}`} done={view.done} today={today} />}
    </>
  );
}
