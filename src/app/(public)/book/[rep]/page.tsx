import { Clock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import styles from "@/components/calendar/calendar.module.scss";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { findHostPage } from "@/server/calendar";

export const metadata: Metadata = { title: { absolute: "Book a meeting · Lumor" } };

/** A rep's public page: their meeting types (F22). */
export default function HostPage({ params }: PageProps<"/book/[rep]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Host params={params} />
    </Suspense>
  );
}

async function Host({ params }: Pick<PageProps<"/book/[rep]">, "params">) {
  await connection();
  const { rep } = await params;
  const page = await findHostPage(getDb(), rep.slice(0, 60));
  if (!page) notFound();
  return (
    <>
      <div className={styles.bookingHead}>
        <h1 className={styles.bookingTitle}>Book a meeting with {page.host.name}</h1>
        <p className={styles.muted}>Pick what you&rsquo;d like to talk about.</p>
      </div>
      {page.types.length === 0 ? (
        <p className={styles.muted}>No meetings are open for booking right now.</p>
      ) : (
        <div className={styles.links}>
          {page.types.map((t) => (
            <Link
              key={t.id}
              href={`/book/${page.profile.slug}/${t.slug}`}
              className={styles.typeLink}
            >
              <strong>{t.name}</strong>
              <span className={styles.facts}>
                <span>
                  <Clock size={14} aria-hidden /> {t.durationMin} min
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
