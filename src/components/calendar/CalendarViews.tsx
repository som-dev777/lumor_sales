import Link from "next/link";
import {
  GRID_END_HOUR,
  GRID_ROWS,
  GRID_START_HOUR,
  placeDay,
  type CalendarView,
} from "@/lib/calendar-view";
import { formatIst, formatIstDate, toIstDate, type IstDate } from "@/lib/time";
import type { BookingListRow } from "@/server/calendar";
import styles from "./calendarViews.module.scss";

type Href = (change: Record<string, string | null>) => string;

const hostClass = (colours: Map<string, number>, hostId: string) =>
  styles[`c${colours.get(hostId) ?? 0}`];

const label = (b: BookingListRow) => `${b.meetingTypeName} · ${b.inviteeName}`;

const people = (b: BookingListRow) => [b.hostName, ...b.teammates.map((t) => t.name)].join(", ");

/** Month view: a 7-column grid of days with their meetings (F22 round 2). */
export function MonthView({
  days,
  month,
  today,
  meetings,
  colours,
  href,
}: {
  days: IstDate[];
  month: string;
  today: IstDate;
  meetings: BookingListRow[];
  colours: Map<string, number>;
  href: Href;
}) {
  const byDay = new Map<string, BookingListRow[]>();
  for (const m of meetings) {
    const k = toIstDate(m.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), m]);
  }
  return (
    <div className={styles.month} role="grid" aria-label="Month">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
        <div key={d} className={styles.monthWeekday} role="columnheader">
          {d}
        </div>
      ))}
      {days.map((d) => {
        const list = byDay.get(d) ?? [];
        return (
          <div
            key={d}
            role="gridcell"
            className={`${styles.monthCell} ${d.slice(0, 7) !== month ? styles.otherMonth : ""} ${d === today ? styles.today : ""}`}
          >
            <Link className={styles.monthDate} href={href({ view: "day", date: d, booking: null })}>
              <span className={styles.srOnly}>{formatIstDate(d, "EEEE d MMMM")}</span>
              <span aria-hidden>{Number(d.slice(8))}</span>
            </Link>
            {list.slice(0, 3).map((m) => (
              <Link
                key={m.id}
                href={href({ booking: m.id })}
                scroll={false}
                className={`${styles.chip} ${hostClass(colours, m.hostId)}`}
                title={`${label(m)} (${people(m)})`}
              >
                <span className={styles.chipTime}>{formatIst(m.startsAt, "h:mm")}</span> {label(m)}
              </Link>
            ))}
            {list.length > 3 && (
              <Link className={styles.more} href={href({ view: "day", date: d, booking: null })}>
                +{list.length - 3} more
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

const ROW_LABELS = Array.from(
  { length: GRID_END_HOUR - GRID_START_HOUR },
  (_, i) => GRID_START_HOUR + i,
);

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

/** Week and day views: a time grid in IST, meetings placed by time, side by side if they overlap. */
export function TimeGridView({
  view,
  days,
  today,
  meetings,
  colours,
  href,
}: {
  view: CalendarView;
  days: IstDate[];
  today: IstDate;
  meetings: BookingListRow[];
  colours: Map<string, number>;
  href: Href;
}) {
  return (
    <div className={styles.gridScroll}>
      <div className={`${styles.timeGrid} ${view === "day" ? styles.oneDay : styles.sevenDays}`}>
        <div className={styles.corner} aria-hidden />
        {days.map((d) => (
          <Link
            key={d}
            href={href({ view: "day", date: d, booking: null })}
            className={`${styles.dayHead} ${d === today ? styles.todayHead : ""}`}
          >
            <span className={styles.dayHeadWeek}>{formatIstDate(d, "EEE")}</span>
            <span className={styles.dayHeadDate}>{formatIstDate(d, "d MMM")}</span>
          </Link>
        ))}
        <div className={styles.hours} aria-hidden>
          {ROW_LABELS.map((h) => (
            <span key={h} className={styles.hourLabel}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
        {days.map((d) => {
          const placed = placeDay(
            d,
            meetings.filter((m) => toIstDate(m.startsAt) === d),
          );
          return (
            <div
              key={d}
              className={`${styles.dayCol} ${d === today ? styles.todayCol : ""}`}
              aria-label={formatIstDate(d, "EEEE d MMMM")}
              role="list"
            >
              {placed.map((p) => (
                <Link
                  key={p.item.id}
                  role="listitem"
                  href={href({ booking: p.item.id })}
                  scroll={false}
                  className={[
                    styles.event,
                    hostClass(colours, p.item.hostId),
                    styles[`r${p.row}`],
                    styles[`s${Math.min(p.span, GRID_ROWS)}`],
                    styles[`lane${p.lane}of${p.lanes}`],
                  ].join(" ")}
                  title={`${label(p.item)} (${people(p.item)})`}
                >
                  <span className={styles.eventTime}>
                    {formatIst(p.item.startsAt, "h:mm")}–{formatIst(p.item.endsAt, "h:mm aaa")}
                  </span>
                  <span className={styles.eventTitle}>{label(p.item)}</span>
                  {p.span >= 3 && <span className={styles.eventPeople}>{people(p.item)}</span>}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Who's who: each host's colour. */
export function HostLegend({
  hosts,
  colours,
}: {
  hosts: { id: string; name: string }[];
  colours: Map<string, number>;
}) {
  if (hosts.length < 2) return null;
  return (
    <ul className={styles.legend} aria-label="Hosts">
      {hosts.map((h) => (
        <li key={h.id}>
          <span className={`${styles.dot} ${hostClass(colours, h.id)}`} aria-hidden />
          {h.name}
        </li>
      ))}
    </ul>
  );
}
