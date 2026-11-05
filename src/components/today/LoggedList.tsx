import Link from "next/link";
import type { DayDone } from "@/server/today";
import { FollowUpDate } from "./FollowUpDate";
import styles from "./today.module.scss";

/** What you logged on a day, with each person's follow-up date beside it (D-057, D-059). */
export function LoggedList({
  title,
  done,
  today,
}: {
  title: string;
  done: DayDone[];
  today: string;
}) {
  return (
    <section className={styles.section} aria-label={title}>
      <h2 className={styles.sectionTitle}>
        {title} <span className={styles.badge}>{done.length}</span>
      </h2>
      {done.length === 0 ? (
        <p className={styles.muted}>Nothing logged.</p>
      ) : (
        <ul className={styles.doneList}>
          {done.map((d, i) => (
            <li key={i} className={styles.doneItem}>
              <span>
                <span className={styles.muted}>{d.when}</span> ·{" "}
                {d.personId ? <Link href={`/people/${d.personId}`}>{d.name}</Link> : d.name} ·{" "}
                {d.what}
              </span>
              {d.personId && d.followUp && (
                <FollowUpDate
                  key={`${d.followUp.date}-${d.followUp.nextAction}`}
                  personId={d.personId}
                  name={d.name}
                  nextAction={d.followUp.nextAction}
                  date={d.followUp.date}
                  today={today}
                  canEdit={d.followUp.canEdit}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
