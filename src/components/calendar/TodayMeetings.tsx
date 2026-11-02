import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { formatIst } from "@/lib/time";
import styles from "./calendar.module.scss";

type Meeting = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  inviteeName: string;
  inviteeCompany: string;
  personId: string | null;
  meetingTypeName: string;
  location: string | null;
  hostName: string;
  hosting: boolean;
};

/** Today's booked meetings, with times, at the top of Today (F22). */
export function TodayMeetings({ meetings }: { meetings: Meeting[] }) {
  if (meetings.length === 0) return null;
  return (
    <section className={`${styles.card} ${styles.todayCard}`} aria-label="Meetings today">
      <h2 className={styles.cardTitle}>
        <CalendarDays size={18} aria-hidden /> Meetings today
      </h2>
      <ul className={styles.meetingList}>
        {meetings.map((m) => (
          <li key={m.id}>
            <Link href={`/calendar?view=day&booking=${m.id}`}>
              <strong>
                {formatIst(m.startsAt, "h:mm aaa")}–{formatIst(m.endsAt, "h:mm aaa")}
              </strong>
            </Link>{" "}
            {m.meetingTypeName} with{" "}
            {m.personId ? (
              <Link href={`/people/${m.personId}`}>{m.inviteeName}</Link>
            ) : (
              m.inviteeName
            )}
            , {m.inviteeCompany}
            {!m.hosting && <span className={styles.muted}> (with {m.hostName})</span>}
            {m.location && /^https?:\/\//.test(m.location) && (
              <>
                {" "}
                ·{" "}
                <a href={m.location} target="_blank" rel="noopener noreferrer">
                  Join
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        <Link href="/calendar">Open the calendar →</Link>
      </p>
    </section>
  );
}
