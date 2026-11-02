import { CheckCircle2, Clock, MapPin, Video } from "lucide-react";
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
import { emailConfigured } from "@/server/email";
import { findByToken, freeSlots, teamOf, whereOf } from "@/server/calendar";

export const metadata: Metadata = { title: { absolute: "Your booking · Lumor" } };

/**
 * The visitor's booking: the success message, the details and the Join button, and only
 * Reschedule and Cancel (F22; D-043).
 */
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
  const [slots, team] = await Promise.all([
    upcoming && page.type.active ? freeSlots(db, page, now, b.id) : Promise.resolve([]),
    teamOf(db, b),
  ]);
  const location = whereOf(b, page);

  return (
    <div className={styles.stack}>
      {query.new && !cancelled && (
        <div className={styles.successHead}>
          <CheckCircle2 size={40} aria-hidden className={styles.successIcon} />
          <h1 className={styles.bookingTitle}>You&rsquo;re booked</h1>
          <p className={styles.muted}>
            {emailConfigured() || b.googleEventId ? (
              <>
                A confirmation{b.googleEventId ? " and a calendar invite are" : " is"} on its way to{" "}
                <strong>{b.inviteeEmail}</strong>.
              </>
            ) : (
              "Keep this page's link: it's where you can reschedule or cancel."
            )}
          </p>
        </div>
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
        <p className={styles.host}>With {team.map((m) => m.name).join(", ")}</p>
        {query.new && !cancelled ? (
          <h2 className={styles.bookingTitle}>{page.type.name}</h2>
        ) : (
          <h1 className={styles.bookingTitle}>{page.type.name}</h1>
        )}
        <p className={styles.facts}>
          <span>
            <Clock size={14} aria-hidden />
            <LocalTime
              iso={b.startsAt.toISOString()}
              ist={`${formatIst(b.startsAt, "EEEE d MMMM yyyy, h:mm aaa")} IST`}
            />{" "}
            · {Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60_000)} min
          </span>
          {location && !/^https?:\/\//.test(location) && (
            <span>
              <MapPin size={14} aria-hidden /> {location}
            </span>
          )}
        </p>
        <p className={styles.muted}>
          In India time: {formatIst(b.startsAt, "EEE d MMM yyyy, h:mm aaa")} IST · Booked by{" "}
          {b.inviteeName} ({b.inviteeEmail})
        </p>
      </div>

      {!cancelled && location && /^https?:\/\//.test(location) && (
        <a className={styles.joinButton} href={location} target="_blank" rel="noopener noreferrer">
          <Video size={18} aria-hidden />
          {b.meetLink ? "Join with Google Meet" : "Join the meeting"}
        </a>
      )}
      {upcoming && <ManageBooking code={code} slots={slots.map((s) => s.toISOString())} />}
    </div>
  );
}
