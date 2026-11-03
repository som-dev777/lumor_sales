import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingWidget, type IntroFact } from "@/components/calendar/BookingWidget";
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
  // What the introduction step shows (D-047): the event, then "Choose a time".
  const facts: IntroFact[] = [
    { icon: "clock", text: `${page.type.durationMin} minutes` },
    ...(rules.mode.show
      ? [{ icon: "pin" as const, text: "Online or in person: you choose" }]
      : google
        ? [{ icon: "video" as const, text: "Google Meet (the link comes with your confirmation)" }]
        : location
          ? [
              /^https?:\/\//.test(location)
                ? { icon: "video" as const, text: "Video call (link in your confirmation)" }
                : { icon: "pin" as const, text: location },
            ]
          : []),
    { icon: "globe", text: "Times in India Standard Time; you can change the time zone" },
  ];
  return page.type.active ? (
    <BookingWidget
      profileSlug={page.profile.slug}
      typeSlug={page.type.slug}
      slots={slots.map((s) => s.toISOString())}
      questions={page.type.questions}
      durationMin={page.type.durationMin}
      fields={rules}
      address={page.type.inPersonAddress}
      online={online}
      intro={{
        host: page.host.name,
        title: page.type.name,
        description: page.type.description,
        facts,
      }}
    />
  ) : (
    <div className={styles.introCard}>
      <p className={styles.host}>{page.host.name}</p>
      <h1 className={styles.bookingTitle}>{page.type.name}</h1>
      <p className={styles.emptySlots}>This meeting isn&rsquo;t taking bookings right now.</p>
    </div>
  );
}
