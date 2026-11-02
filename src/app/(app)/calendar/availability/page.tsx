import { CheckCircle2, Video } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AvailabilityForm } from "@/components/calendar/AvailabilityForm";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { GoogleDisconnect } from "@/components/calendar/GoogleDisconnect";
import styles from "@/components/calendar/calendar.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { formatIst, todayIst } from "@/lib/time";
import { appUrl } from "@/lib/tokens";
import { listMeetingTypes, previewSlots, profileView } from "@/server/calendar";
import { connectionView, googleConfigured } from "@/server/google/google";

export const metadata: Metadata = { title: "Availability" };

const GOOGLE_RESULT: Record<string, { tone: "success" | "error" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar connected. New bookings get a Meet link." },
  cancelled: { tone: "warning", text: "Google connection cancelled. Nothing changed." },
  failed: { tone: "error", text: "Couldn't connect Google Calendar. Please try again." },
  "not-set-up": {
    tone: "warning",
    text: "Google isn't set up for this site yet. The owner adds it once (docs/deploy.md).",
  },
};

export default function AvailabilityPage({ searchParams }: PageProps<"/calendar/availability">) {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="When people can book you. Your meetings (and Google Calendar busy times, when connected) always block their time."
      />
      <CalendarTabs current="/calendar/availability" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Availability searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Availability({
  searchParams,
}: Pick<PageProps<"/calendar/availability">, "searchParams">) {
  const viewer = await requireUser();
  await connection();
  const { google } = await searchParams;
  const db = getDb();
  const now = await appNow();
  const [profile, types, connected, preview] = await Promise.all([
    profileView(db, viewer),
    listMeetingTypes(db, viewer.id),
    connectionView(db, viewer.id),
    previewSlots(db, viewer.id, now),
  ]);
  const result = typeof google === "string" ? GOOGLE_RESULT[google] : undefined;
  return (
    <div className={styles.stack}>
      {result && <Alert tone={result.tone}>{result.text}</Alert>}

      <section className={styles.card} aria-label="Google Calendar">
        <h2 className={styles.cardTitle}>
          <Video size={18} aria-hidden /> Google Calendar and Meet
        </h2>
        {connected ? (
          <>
            <p className={styles.row}>
              <CheckCircle2 size={16} aria-hidden /> Connected as <strong>{connected.email}</strong>
            </p>
            {connected.lastError && <Alert tone="warning">{connected.lastError}</Alert>}
            <p className={styles.muted}>
              Each booking gets its own Google Meet link and an event in your Google Calendar, and
              your Google busy times block booking slots.
            </p>
            <div className={styles.row}>
              {connected.lastError && (
                <a className={styles.buttonLink} href="/api/google/connect">
                  Reconnect Google
                </a>
              )}
              <GoogleDisconnect />
            </div>
          </>
        ) : (
          <>
            <p className={styles.muted}>
              Connect your Google account so every booking gets a Google Meet link automatically,
              the meeting lands in your Google Calendar, and people can&rsquo;t book over your
              Google busy times.
            </p>
            {googleConfigured() ? (
              <div>
                <a className={styles.buttonLink} href="/api/google/connect">
                  Connect Google Calendar
                </a>
              </div>
            ) : (
              <Alert tone="info">
                Google isn&rsquo;t set up for this site yet. The owner adds it once (docs/deploy.md,
                “Google Calendar and Meet”); then this button appears.
              </Alert>
            )}
          </>
        )}
      </section>

      <AvailabilityForm
        initial={profile}
        baseUrl={appUrl()}
        today={todayIst(now)}
        loginEmail={viewer.email}
        meetingTypes={types
          .filter((t) => t.active)
          .map((t) => ({ name: t.name, durationMin: t.durationMin }))}
      />

      <section className={styles.card} aria-label="What people see">
        <h2 className={styles.cardTitle}>What people see</h2>
        <p className={styles.muted}>
          The next free times on each of your booking links (India time), after saving. Minimum
          notice and your meetings are taken into account.
        </p>
        {!profile.saved || preview.length === 0 ? (
          <p className={styles.muted}>Save your hours and create an event to see the times here.</p>
        ) : (
          <ul className={styles.previewList}>
            {preview.map((p) => (
              <li key={p.id}>
                <strong>
                  {p.name} ({p.durationMin} min)
                </strong>
                {p.count === 0 ? (
                  <span className={styles.warnText}>
                    {" "}
                    No free times. Check that it fits inside your hours.
                  </span>
                ) : (
                  <span className={styles.muted}>
                    {" "}
                    · {p.count} free time{p.count === 1 ? "" : "s"}. Next:{" "}
                    {p.next.map((d) => formatIst(d, "EEE d MMM, h:mm aaa")).join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
