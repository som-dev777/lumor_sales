import { CalendarDays, Video } from "lucide-react";
import Link from "next/link";
import { formatIst, toIstDate } from "@/lib/time";
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

/**
 * Your meetings at the top of Today (F22; D-045): today's, then the next 7 days, each with Join
 * (when there's a link) and Details.
 */
export function TodayMeetings({ today, upcoming }: { today: Meeting[]; upcoming: Meeting[] }) {
  return (
    <section className={`${styles.card} ${styles.todayCard}`} aria-label="Your meetings">
      <h2 className={styles.cardTitle}>
        <CalendarDays size={18} aria-hidden /> Your meetings
      </h2>
      <h3 className={styles.sectionTitle}>Today</h3>
      {today.length === 0 ? (
        <p className={styles.muted}>No meetings today.</p>
      ) : (
        <MeetingList meetings={today} withDay={false} />
      )}
      {upcoming.length > 0 && (
        <>
          <h3 className={styles.sectionTitle}>Next 7 days</h3>
          <MeetingList meetings={upcoming} withDay />
        </>
      )}
      <p className={styles.muted}>
        <Link href="/calendar">Open the calendar →</Link>
      </p>
    </section>
  );
}

function MeetingList({ meetings, withDay }: { meetings: Meeting[]; withDay: boolean }) {
  return (
    <ul
      className={styles.meetingRows}
      aria-label={withDay ? "Upcoming meetings" : "Meetings today"}
    >
      {meetings.map((m) => {
        const link = m.location && /^https?:\/\//.test(m.location) ? m.location : null;
        return (
          <li key={m.id} className={styles.meetingRow}>
            <div className={styles.meetingWhen}>
              {withDay && <span>{formatIst(m.startsAt, "EEE d MMM")}</span>}
              <strong>
                {formatIst(m.startsAt, "h:mm")}–{formatIst(m.endsAt, "h:mm aaa")}
              </strong>
            </div>
            <div className={styles.meetingWhat}>
              <span>
                {m.meetingTypeName} with{" "}
                {m.personId ? (
                  <Link href={`/people/${m.personId}`}>{m.inviteeName}</Link>
                ) : (
                  m.inviteeName
                )}
                {m.inviteeCompany ? `, ${m.inviteeCompany}` : ""}
              </span>
              <span className={styles.muted}>
                {m.hosting ? "You're hosting" : `With ${m.hostName}`}
                {m.location && !link ? ` · ${m.location}` : ""}
              </span>
            </div>
            <div className={styles.meetingButtons}>
              {link && (
                <a
                  className={styles.joinSmall}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Join the meeting with ${m.inviteeName}`}
                >
                  <Video size={16} aria-hidden /> Join
                </a>
              )}
              <Link
                className={styles.detailsLink}
                href={`/calendar?view=day&date=${toIstDate(m.startsAt)}&booking=${m.id}`}
                aria-label={`Details of the meeting with ${m.inviteeName}`}
              >
                Details
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
