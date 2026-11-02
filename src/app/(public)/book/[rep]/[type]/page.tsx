import { Clock, Globe, MapPin, Video } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingWidget } from "@/components/calendar/BookingWidget";
import styles from "@/components/calendar/calendar.module.scss";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { fieldRules } from "@/lib/booking-fields";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { findBookingPage, freeSlots } from "@/server/calendar";
import { connectionView, googleConfigured } from "@/server/google/google";

export const metadata: Metadata = { title: { absolute: "Book a meeting · Lumor" } };

/** The public booking page for one meeting type (F22). No sign-in. */
export default function BookPage({ params }: PageProps<"/book/[rep]/[type]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading free times…" />}>
      <Book params={params} />
    </Suspense>
  );
}

async function Book({ params }: Pick<PageProps<"/book/[rep]/[type]">, "params">) {
  await connection();
  const { rep, type } = await params;
  const db = getDb();
  const page = await findBookingPage(db, rep.slice(0, 60), type.slice(0, 60));
  if (!page) notFound();
  const now = await appNow();
  const [slots, google] = await Promise.all([
    page.type.active ? freeSlots(db, page, now) : Promise.resolve([]),
    page.type.googleMeet && googleConfigured() ? connectionView(db, page.host.id) : null,
  ]);
  const location = page.type.location;
  const rules = fieldRules(page.type.standardFields);
  const online = google
    ? "Google Meet (link in your confirmation)"
    : location && /^https?:\/\//.test(location)
      ? "Video call (link in your confirmation)"
      : (location ?? "We'll send the details");
  return (
    <div className={styles.bookingShell}>
      <aside className={styles.bookingInfo}>
        <p className={styles.host}>{page.host.name}</p>
        <h1 className={styles.bookingTitle}>{page.type.name}</h1>
        <ul className={styles.factList}>
          <li>
            <Clock size={16} aria-hidden /> {page.type.durationMin} minutes
          </li>
          {rules.mode.show ? (
            <li>
              <MapPin size={16} aria-hidden /> Online or in person: you choose
            </li>
          ) : google ? (
            <li>
              <Video size={16} aria-hidden /> Google Meet (the link comes with your confirmation)
            </li>
          ) : (
            location && (
              <li>
                {/^https?:\/\//.test(location) ? (
                  <>
                    <Video size={16} aria-hidden /> Video call (link in your confirmation)
                  </>
                ) : (
                  <>
                    <MapPin size={16} aria-hidden /> {location}
                  </>
                )}
              </li>
            )
          )}
          <li>
            <Globe size={16} aria-hidden /> Times in India Standard Time; change below
          </li>
        </ul>
        {page.type.description && <p className={styles.description}>{page.type.description}</p>}
      </aside>
      <section className={styles.bookingMain} aria-label="Book a time">
        {page.type.active ? (
          <BookingWidget
            profileSlug={page.profile.slug}
            typeSlug={page.type.slug}
            slots={slots.map((s) => s.toISOString())}
            questions={page.type.questions}
            durationMin={page.type.durationMin}
            fields={rules}
            address={page.type.inPersonAddress}
            online={online}
          />
        ) : (
          <p className={styles.emptySlots}>This meeting isn&rsquo;t taking bookings right now.</p>
        )}
      </section>
    </div>
  );
}
