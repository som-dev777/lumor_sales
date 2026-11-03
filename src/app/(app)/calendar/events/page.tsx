import { Clock, ExternalLink, MapPin, Video } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { MeetingTypeDialog } from "@/components/calendar/MeetingTypeDialog";
import { DeleteEventButton } from "@/components/calendar/DeleteEventButton";
import { MeetingTypeSwitch } from "@/components/calendar/MeetingTypeSwitch";
import styles from "@/components/calendar/calendar.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import { fieldRules } from "@/lib/booking-fields";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { appNow } from "@/lib/clock";
import { bookingLink, listMeetingTypes, profileView, upcomingCountOf } from "@/server/calendar";
import { connectionView, googleConfigured } from "@/server/google/google";

export const metadata: Metadata = { title: "Events" };

export default function MeetingTypesPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Each event has its own booking link. Paste it into a message; people pick a free time."
        actions={
          <Suspense fallback={null}>
            <NewMeetingType />
          </Suspense>
        }
      />
      <CalendarTabs current="/calendar/events" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <MeetingTypes />
      </Suspense>
    </>
  );
}

async function googleReadyFor(userId: string) {
  return googleConfigured() && (await connectionView(getDb(), userId)) !== null;
}

async function NewMeetingType() {
  const viewer = await requireUser();
  await connection();
  return <MeetingTypeDialog googleReady={await googleReadyFor(viewer.id)} />;
}

async function MeetingTypes() {
  const viewer = await requireUser();
  await connection();
  const db = getDb();
  const [types, profile, googleReady] = await Promise.all([
    listMeetingTypes(db, viewer.id),
    profileView(db, viewer),
    googleReadyFor(viewer.id),
  ]);
  const now = await appNow();
  const upcoming = new Map(
    await Promise.all(
      types.map(async (t) => [t.id, await upcomingCountOf(db, t.id, now)] as const),
    ),
  );
  if (types.length === 0) {
    return (
      <StatusMessage title="No events yet">
        Create one, for example “Lumor demo, 30 minutes”, to get a booking link.
      </StatusMessage>
    );
  }
  return (
    <div className={styles.stack}>
      {types.map((t) => {
        const link = bookingLink(profile.slug, t.slug);
        return (
          <section key={t.id} className={styles.card} aria-label={t.name}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>
                  {t.name}{" "}
                  {t.active ? (
                    <Badge tone="success">● Online</Badge>
                  ) : (
                    <Badge tone="neutral">○ Offline</Badge>
                  )}
                </h2>
                <p className={styles.facts}>
                  <span>
                    <Clock size={14} aria-hidden /> {t.durationMin} min
                  </span>
                  {t.googleMeet && googleReady ? (
                    <span>
                      <Video size={14} aria-hidden /> Google Meet (a new link each booking)
                    </span>
                  ) : (
                    t.location && (
                      <span>
                        <MapPin size={14} aria-hidden /> {t.location}
                      </span>
                    )
                  )}
                  {fieldRules(t.standardFields).mode.show && (
                    <span>
                      <MapPin size={14} aria-hidden /> Online or in person
                    </span>
                  )}
                  {t.questions.length > 0 && (
                    <span>
                      {t.questions.length} question{t.questions.length === 1 ? "" : "s"}
                    </span>
                  )}
                  <span>
                    {t.minNoticeHours} h notice · up to {t.maxDaysAhead} days ahead
                    {t.maxPerDay ? ` · max ${t.maxPerDay} a day` : ""}
                  </span>
                </p>
              </div>
              <div className={styles.row}>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  Open <ExternalLink size={14} aria-hidden />
                </a>
                <MeetingTypeSwitch id={t.id} name={t.name} active={t.active} />
                <DeleteEventButton id={t.id} name={t.name} upcoming={upcoming.get(t.id) ?? 0} />
                <MeetingTypeDialog
                  meetingTypeId={t.id}
                  name={t.name}
                  googleReady={googleReady}
                  defaults={{
                    name: t.name,
                    slug: t.slug,
                    durationMin: t.durationMin,
                    description: t.description ?? "",
                    location: t.location ?? "",
                    bufferMin: t.bufferMin,
                    minNoticeHours: t.minNoticeHours,
                    maxDaysAhead: t.maxDaysAhead,
                    maxPerDay: t.maxPerDay ?? "",
                    googleMeet: t.googleMeet,
                    questions: t.questions.map((q) => ({
                      ...q,
                      type: q.type ?? "short",
                      options: q.options ?? [],
                    })),
                    standardFields: fieldRules(t.standardFields),
                    emailName: t.emailName ?? "",
                    emailNote: t.emailNote ?? "",
                    inPersonAddress: t.inPersonAddress ?? "",
                  }}
                />
              </div>
            </div>
            <CopyField label={`Booking link for ${t.name}`} value={link} />
            {!t.active && (
              <p className={styles.muted}>
                Offline: the link still opens, but says it isn&rsquo;t taking bookings. Go online to
                take bookings again.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
