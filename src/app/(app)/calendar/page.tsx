import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { HostLegend, MonthView, TimeGridView } from "@/components/calendar/CalendarViews";
import { MeetingDetailDialog, type DetailData } from "@/components/calendar/MeetingDetailDialog";
import { ScheduleMeetingDialog } from "@/components/calendar/ScheduleMeetingDialog";
import { WhoFilter } from "@/components/calendar/WhoFilter";
import styles from "@/components/calendar/calendar.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import {
  colourIndex,
  daysShown,
  parseDate,
  parseView,
  rangeOf,
  stepDate,
  VIEWS,
  type CalendarView,
} from "@/lib/calendar-view";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser, type Viewer } from "@/lib/session";
import { formatIst, formatIstDate, todayIst } from "@/lib/time";
import {
  canChangeTeam,
  listBookings,
  meetingDetail,
  meetingsBetween,
  teammateChoices,
  type BookingListRow,
  type MeetingFilter,
} from "@/server/calendar";
import { leadFormOptions } from "@/server/leads/options";

export const metadata: Metadata = { title: "Calendar" };

const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
  list: "List",
};

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Booked and scheduled meetings, in India time (IST). Pick a rep to see theirs; click a meeting for details, teammates and changes."
      />
      <CalendarTabs current="/calendar" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Meetings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Meetings({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  const viewer = await requireUser();
  await connection();
  const query = await searchParams;
  const db = getDb();
  const now = await appNow();
  const today = todayIst(now);
  const view = parseView(one(query.view));
  const date = parseDate(one(query.date), today);
  // One rep at a time, starting on the signed-in rep (D-043).
  const reps = await teammateChoices(db);
  const whoParam = one(query.who);
  const who = whoParam && reps.some((r) => r.id === whoParam) ? whoParam : viewer.id;
  const filter: MeetingFilter = { userId: who };
  const past = one(query.show) === "past";

  const current = {
    view,
    date,
    who: who === viewer.id ? null : who,
    show: past ? "past" : null,
    booking: one(query.booking) ?? null,
  };
  const href = (change: Record<string, string | null>) => {
    const next = { ...current, ...change };
    const p = new URLSearchParams();
    if (next.view !== "week") p.set("view", next.view);
    if (next.date !== today) p.set("date", next.date);
    if (next.who) p.set("who", next.who);
    if (next.show && next.view === "list") p.set("show", next.show);
    if (next.booking) p.set("booking", next.booking);
    return `/calendar${p.size ? `?${p}` : ""}`;
  };

  const range = rangeOf(view, date);
  const meetings =
    view === "list"
      ? await listBookings(db, filter, past ? "past" : "upcoming", now)
      : await meetingsBetween(db, filter, range.start, range.end);
  const colours = colourIndex(reps.map((r) => r.id));
  const hosts = reps.filter((r) => meetings.some((m) => m.hostId === r.id));
  const days = daysShown(view, date);
  const title =
    view === "month"
      ? formatIstDate(`${date.slice(0, 7)}-01`, "MMMM yyyy")
      : view === "day"
        ? formatIstDate(date, "EEEE d MMMM yyyy")
        : view === "week"
          ? `${formatIstDate(days[0], "d MMM")} – ${formatIstDate(days[6], "d MMM yyyy")}`
          : past
            ? "Past meetings"
            : "Upcoming meetings";

  return (
    <div className={styles.stack}>
      <div className={styles.calToolbar}>
        <div className={styles.row}>
          {view !== "list" && (
            <>
              <Link className={styles.navButton} href={href({ date: today, booking: null })}>
                Today
              </Link>
              <Link
                className={styles.iconLink}
                aria-label="Back"
                href={href({ date: stepDate(view, date, -1), booking: null })}
              >
                <ChevronLeft size={18} aria-hidden />
              </Link>
              <Link
                className={styles.iconLink}
                aria-label="Next"
                href={href({ date: stepDate(view, date, 1), booking: null })}
              >
                <ChevronRight size={18} aria-hidden />
              </Link>
            </>
          )}
          <h2 className={styles.calTitle}>{title}</h2>
        </div>
        <div className={styles.row}>
          <nav className={styles.segmented} aria-label="View">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={href({ view: v, booking: null })}
                aria-current={v === view ? "page" : undefined}
                className={v === view ? styles.segOn : undefined}
              >
                {VIEW_LABELS[v]}
              </Link>
            ))}
          </nav>
          <WhoFilter value={who} me={viewer.id} reps={reps} />
          {can(viewer, "calendar.manage", { ownerId: viewer.id }) && <ScheduleMeetingDialog />}
        </div>
      </div>

      <HostLegend hosts={hosts} colours={colours} />

      {view === "month" && (
        <MonthView
          days={days}
          month={date.slice(0, 7)}
          today={today}
          meetings={meetings}
          colours={colours}
          href={href}
        />
      )}
      {(view === "week" || view === "day") && (
        <>
          <TimeGridView
            view={view}
            days={days}
            today={today}
            meetings={meetings}
            colours={colours}
            href={href}
          />
          {meetings.length === 0 && (
            <p className={styles.muted}>
              No meetings {view === "day" ? "this day" : "this week"}. Share a booking link from
              Events, or schedule one.
            </p>
          )}
        </>
      )}
      {view === "list" && <ListView meetings={meetings} past={past} href={href} />}

      {current.booking && (
        <Suspense fallback={null}>
          <Detail id={current.booking} viewer={viewer} now={now} />
        </Suspense>
      )}
    </div>
  );
}

function ListView({
  meetings,
  past,
  href,
}: {
  meetings: BookingListRow[];
  past: boolean;
  href: (change: Record<string, string | null>) => string;
}) {
  return (
    <div className={styles.stack}>
      <nav className={styles.row} aria-label="Which meetings">
        <Link href={href({ show: null, booking: null })} aria-current={past ? undefined : "page"}>
          {past ? "Upcoming" : <strong>Upcoming</strong>}
        </Link>
        <span aria-hidden>·</span>
        <Link href={href({ show: "past", booking: null })} aria-current={past ? "page" : undefined}>
          {past ? <strong>Past</strong> : "Past"}
        </Link>
      </nav>
      {meetings.length === 0 ? (
        <StatusMessage title={past ? "No past bookings" : "No upcoming bookings"}>
          Share a booking link from Events, or schedule a meeting; they show up here.
        </StatusMessage>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label={past ? "Past bookings" : "Upcoming bookings"}>
            <thead>
              <tr>
                <th scope="col">When (IST)</th>
                <th scope="col">Meeting</th>
                <th scope="col">Who booked</th>
                <th scope="col">On the meeting</th>
                <th scope="col">Person</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((b) => {
                const cancelled = b.status === "Cancelled";
                return (
                  <tr key={b.id}>
                    <td className={cancelled ? styles.cancelled : undefined}>
                      <Link href={href({ booking: b.id })} scroll={false}>
                        {formatIst(b.startsAt, "EEE d MMM yyyy, h:mm aaa")}
                      </Link>
                    </td>
                    <td>
                      {b.meetingTypeName}{" "}
                      {cancelled && (
                        <Badge tone="danger">
                          Cancelled{b.cancelledBy === "invitee" ? " by them" : ""}
                        </Badge>
                      )}
                      {b.rescheduledFromId && !cancelled && (
                        <Badge tone="primary">Rescheduled</Badge>
                      )}
                    </td>
                    <td>
                      <strong>{b.inviteeName}</strong>, {b.inviteeCompany}
                      <br />
                      <a href={`mailto:${b.inviteeEmail}`}>{b.inviteeEmail}</a>
                    </td>
                    <td>{[b.hostName, ...b.teammates.map((t) => t.name)].join(", ")}</td>
                    <td>
                      {b.personId ? (
                        <Link href={`/people/${b.personId}`}>{b.personName}</Link>
                      ) : (
                        <Link href={href({ booking: b.id })} scroll={false}>
                          Details / Add as person
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function Detail({ id, viewer, now }: { id: string; viewer: Viewer; now: Date }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = getDb();
  const m = await meetingDetail(db, id);
  if (!m) return null;
  const [mayChange, choices, options] = await Promise.all([
    canChangeTeam(db, viewer, m),
    teammateChoices(db),
    leadFormOptions(db),
  ]);
  // One link per meeting (D-050): a Google meeting shows only its own Meet link.
  const where =
    m.meetLink ??
    (m.mode === "in_person"
      ? `In person: ${m.location ?? m.typeAddress ?? "place to be confirmed"}`
      : (m.location ??
        (m.googleEventId ? "Google Meet (the link is in the calendar invite)" : m.typeLocation)));
  const data: DetailData = {
    id: m.id,
    status: m.status,
    meetingTypeName: m.meetingTypeName,
    when: `${formatIst(m.startsAt, "EEEE d MMMM yyyy, h:mm aaa")} – ${formatIst(m.endsAt, "h:mm aaa")} IST`,
    durationMin: Math.round((m.endsAt.getTime() - m.startsAt.getTime()) / 60_000),
    where,
    isMeet: Boolean(m.meetLink),
    upcoming: m.endsAt > now,
    invitee: {
      name: m.inviteeName,
      company: m.inviteeCompany,
      email: m.inviteeEmail,
      phone: m.inviteePhone,
      linkedin: m.inviteeLinkedin,
    },
    answers: m.answers,
    note: m.inviteeNote,
    cancelReason: m.cancelReason,
    cancelledBy: m.cancelledBy,
    rescheduled: Boolean(m.rescheduledFromId),
    person: m.personId && m.personName ? { id: m.personId, name: m.personName } : null,
    team: m.team.map((t) => ({ id: t.id, name: t.name, host: t.host })),
    // A scheduled meeting shows its CC list under Invited; other meetings list guests (D-045).
    guests: m.anyTime ? [] : m.ccEmails,
    scheduled: m.anyTime ? { to: m.toEmails, cc: m.ccEmails, message: m.message } : null,
  };
  return (
    <MeetingDetailDialog
      data={data}
      canManage={can(viewer, "calendar.manage", { ownerId: m.hostId })}
      canChangeTeam={mayChange}
      choices={choices}
      options={options}
      canChooseOwner={can(viewer, "lead.reassign")}
    />
  );
}
