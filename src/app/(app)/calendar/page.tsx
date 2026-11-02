import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { CancelBookingButton } from "@/components/calendar/CancelBookingButton";
import styles from "@/components/calendar/calendar.module.scss";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import { EMPTY_PERSON } from "@/components/leads/PersonForm";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { listBookings } from "@/server/calendar";
import { leadFormOptions } from "@/server/leads/options";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Meetings people booked from your booking links. Times are in India time (IST)."
      />
      <CalendarTabs current="/calendar" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) {
  const viewer = await requireUser();
  await connection();
  const { show } = await searchParams;
  const when = show === "past" ? "past" : "upcoming";
  const db = getDb();
  const now = await appNow();
  const [rows, options] = await Promise.all([
    listBookings(db, viewer.id, when, now),
    leadFormOptions(db),
  ]);

  return (
    <div className={styles.stack}>
      <div className={styles.topRow}>
        <nav className={styles.row} aria-label="Which bookings">
          <Link href="/calendar" aria-current={when === "upcoming" ? "page" : undefined}>
            {when === "upcoming" ? <strong>Upcoming</strong> : "Upcoming"}
          </Link>
          <span aria-hidden>·</span>
          <Link href="/calendar?show=past" aria-current={when === "past" ? "page" : undefined}>
            {when === "past" ? <strong>Past</strong> : "Past"}
          </Link>
        </nav>
        <Link href="/calendar/meeting-types">Your booking links →</Link>
      </div>
      {rows.length === 0 ? (
        <StatusMessage title={when === "upcoming" ? "No upcoming bookings" : "No past bookings"}>
          Share a booking link from Meeting types; bookings show up here.
        </StatusMessage>
      ) : (
        <div className={styles.tableWrap}>
          <table
            className={styles.table}
            aria-label={when === "upcoming" ? "Upcoming bookings" : "Past bookings"}
          >
            <thead>
              <tr>
                <th scope="col">When (IST)</th>
                <th scope="col">Meeting</th>
                <th scope="col">Who</th>
                <th scope="col">Person</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const cancelled = b.status === "Cancelled";
                const details = [
                  b.inviteeNote ? `Note: ${b.inviteeNote}` : "",
                  ...b.answers.filter((a) => a.answer).map((a) => `${a.question}: ${a.answer}`),
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <tr key={b.id}>
                    <td className={cancelled ? styles.cancelled : undefined}>
                      {formatIst(b.startsAt, "EEE d MMM yyyy, h:mm aaa")}
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
                      {b.inviteePhone && <> · {b.inviteePhone}</>}
                      {details && <div className={styles.details}>{details}</div>}
                      {b.cancelReason && cancelled && (
                        <div className={styles.details}>Reason: {b.cancelReason}</div>
                      )}
                    </td>
                    <td>
                      {b.personId ? (
                        <Link href={`/people/${b.personId}`}>{b.personName}</Link>
                      ) : (
                        <PersonDialogButton
                          label="Add as person"
                          ariaLabel={`Add ${b.inviteeName} as a person`}
                          options={options}
                          canChooseOwner={can(viewer, "lead.reassign")}
                          defaults={{
                            ...EMPTY_PERSON,
                            fullName: b.inviteeName,
                            companyName: b.inviteeCompany,
                            email: b.inviteeEmail,
                            phone: b.inviteePhone ?? "",
                            linkedinUrl: b.inviteeLinkedin ?? "",
                          }}
                        />
                      )}
                    </td>
                    <td>
                      {!cancelled && when === "upcoming" && (
                        <CancelBookingButton id={b.id} who={b.inviteeName} />
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
