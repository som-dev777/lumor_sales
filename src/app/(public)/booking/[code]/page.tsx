import { CalendarPlus, Clock, Download, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/calendar/LocalTime";
import { ManageBooking } from "@/components/calendar/ManageBooking";
import styles from "@/components/calendar/calendar.module.scss";
import { Alert } from "@/components/ui/Alert";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { formatIst } from "@/lib/time";
import { bookingGoogleLink, bookingLink, findByToken, freeSlots } from "@/server/calendar";

export const metadata: Metadata = { title: { absolute: "Your booking · Lumor" } };

/** The visitor's booking: details, add to calendar, reschedule or cancel (F22). */
export default function BookingPage({ params, searchParams }: PageProps<"/booking/[code]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Booking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Booking({
  params,
  searchParams,
}: Pick<PageProps<"/booking/[code]">, "params" | "searchParams">) {
  await connection();
  const { code } = await params;
  const query = await searchParams;
  const db = getDb();
  const found = await findByToken(db, code);
  if (!found) notFound();
  const { booking: b, page } = found;
  const now = await appNow();
  const cancelled = b.status === "Cancelled";
  const upcoming = !cancelled && b.startsAt > now;
  const slots = upcoming && page.type.active ? await freeSlots(db, page, now, b.id) : [];
  const location = page.type.location;

  return (
    <div className={styles.stack}>
      {query.new && !cancelled && (
        <Alert tone="success">
          You&rsquo;re booked. A confirmation is on its way to {b.inviteeEmail}.
        </Alert>
      )}
      {query.moved && !cancelled && (
        <Alert tone="success">Your meeting has moved to the new time.</Alert>
      )}
      {cancelled && (
        <Alert tone="warning">
          {b.cancelReason === "Rescheduled"
            ? "This booking was moved to a new time. Use the link in your latest email."
            : "This booking is cancelled."}
        </Alert>
      )}
      <div className={styles.bookingHead}>
        <p className={styles.host}>{page.host.name} · Lumor</p>
        <h1 className={styles.bookingTitle}>{page.type.name}</h1>
        <p className={styles.facts}>
          <span>
            <Clock size={14} aria-hidden />
            <LocalTime
              iso={b.startsAt.toISOString()}
              ist={`${formatIst(b.startsAt, "EEEE d MMMM yyyy, h:mm aaa")} IST`}
            />{" "}
            · {page.type.durationMin} min
          </span>
          {location && (
            <span>
              <MapPin size={14} aria-hidden />
              {/^https?:\/\//.test(location) ? (
                <a href={location} target="_blank" rel="noopener noreferrer">
                  Join link
                </a>
              ) : (
                location
              )}
            </span>
          )}
        </p>
        <p className={styles.muted}>
          In India time: {formatIst(b.startsAt, "EEE d MMM yyyy, h:mm aaa")} IST · Booked by{" "}
          {b.inviteeName} ({b.inviteeEmail})
        </p>
      </div>

      {!cancelled && (
        <div className={styles.row}>
          <a
            className={styles.typeLink}
            href={bookingGoogleLink(b, page)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={styles.row}>
              <CalendarPlus size={16} aria-hidden /> Add to Google Calendar
            </span>
          </a>
          <a className={styles.typeLink} href={`/booking/${code}/ics`} download="lumor-meeting.ics">
            <span className={styles.row}>
              <Download size={16} aria-hidden /> Calendar file (Outlook, Apple)
            </span>
          </a>
        </div>
      )}

      {upcoming && <ManageBooking code={code} slots={slots.map((s) => s.toISOString())} />}
      {cancelled && b.cancelReason !== "Rescheduled" && page.type.active && (
        <p>
          <a href={bookingLink(page.profile.slug, page.type.slug)}>Book another time</a>
        </p>
      )}
    </div>
  );
}
