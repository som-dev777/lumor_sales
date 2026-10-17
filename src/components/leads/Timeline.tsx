import { formatIst } from "@/lib/time";
import styles from "./leads.module.scss";

export type TimelineEvent = {
  id: string;
  occurredAt: Date;
  type: string;
  channel: string;
  content: string | null;
  replyType: string | null;
  userName: string | null;
  personName?: string;
};

/** Activities, newest first. */
export function Timeline({
  events,
  showPerson = false,
}: {
  events: TimelineEvent[];
  showPerson?: boolean;
}) {
  if (events.length === 0) return <p className={styles.muted}>Nothing logged yet.</p>;
  return (
    <ol className={styles.timeline}>
      {events.map((e) => (
        <li key={e.id} className={styles.event}>
          <span className={styles.dot} aria-hidden />
          <div>
            <p className={styles.eventTitle}>
              {e.type}
              {e.replyType ? ` · ${e.replyType}` : ""}
              {showPerson && e.personName ? ` · ${e.personName}` : ""}
            </p>
            <p className={styles.muted}>
              {formatIst(e.occurredAt)} · {e.userName ?? "System"}
              {e.channel !== "LinkedIn" ? ` · ${e.channel}` : ""}
            </p>
            {e.content && <p className={styles.eventBody}>{e.content}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
