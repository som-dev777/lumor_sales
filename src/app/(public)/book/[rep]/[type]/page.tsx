import { Clock, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { BookingWidget } from "@/components/calendar/BookingWidget";
import styles from "@/components/calendar/calendar.module.scss";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { findBookingPage, freeSlots } from "@/server/calendar";

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
  const slots = page.type.active ? await freeSlots(db, page, await appNow()) : [];
  return (
    <>
      <div className={styles.bookingHead}>
        <p className={styles.host}>{page.host.name} · Lumor</p>
        <h1 className={styles.bookingTitle}>{page.type.name}</h1>
        <p className={styles.facts}>
          <span>
            <Clock size={14} aria-hidden /> {page.type.durationMin} min
          </span>
          {page.type.location && (
            <span>
              <MapPin size={14} aria-hidden />
              {/^https?:\/\//.test(page.type.location)
                ? "Video call (link in your invite)"
                : page.type.location}
            </span>
          )}
        </p>
        {page.type.description && <p>{page.type.description}</p>}
      </div>
      {page.type.active ? (
        <BookingWidget
          profileSlug={page.profile.slug}
          typeSlug={page.type.slug}
          slots={slots.map((s) => s.toISOString())}
          questions={page.type.questions}
        />
      ) : (
        <p className={styles.muted}>This meeting isn&rsquo;t taking bookings right now.</p>
      )}
    </>
  );
}
