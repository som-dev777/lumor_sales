import { Clock, ExternalLink, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { MeetingTypeDialog } from "@/components/calendar/MeetingTypeDialog";
import { MeetingTypeSwitch } from "@/components/calendar/MeetingTypeSwitch";
import styles from "@/components/calendar/calendar.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { bookingLink, listMeetingTypes, profileView } from "@/server/calendar";

export const metadata: Metadata = { title: "Meeting types" };

export default function MeetingTypesPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Each meeting type has its own booking link. Paste it into a message; people pick a free time."
        actions={<MeetingTypeDialog />}
      />
      <CalendarTabs current="/calendar/meeting-types" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <MeetingTypes />
      </Suspense>
    </>
  );
}

async function MeetingTypes() {
  const viewer = await requireUser();
  await connection();
  const db = getDb();
  const [types, profile] = await Promise.all([
    listMeetingTypes(db, viewer.id),
    profileView(db, viewer),
  ]);
  if (types.length === 0) {
    return (
      <StatusMessage title="No meeting types yet">
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
                  {t.name} {!t.active && <Badge tone="neutral">Off</Badge>}
                </h2>
                <p className={styles.facts}>
                  <span>
                    <Clock size={14} aria-hidden /> {t.durationMin} min
                  </span>
                  {t.location && (
                    <span>
                      <MapPin size={14} aria-hidden /> {t.location}
                    </span>
                  )}
                  <span>
                    {t.minNoticeHours} h notice · up to {t.maxDaysAhead} days ahead
                    {t.bufferMin ? ` · ${t.bufferMin} min gap` : ""}
                    {t.maxPerDay ? ` · max ${t.maxPerDay} a day` : ""}
                  </span>
                </p>
              </div>
              <div className={styles.row}>
                <a href={link} target="_blank" rel="noopener noreferrer">
                  Open <ExternalLink size={14} aria-hidden />
                </a>
                <MeetingTypeSwitch id={t.id} name={t.name} active={t.active} />
                <MeetingTypeDialog
                  meetingTypeId={t.id}
                  name={t.name}
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
                    questions: t.questions,
                  }}
                />
              </div>
            </div>
            <CopyField label={`Booking link for ${t.name}`} value={link} />
            {!t.active && (
              <p className={styles.muted}>
                Switched off: the link still opens, but says it isn&rsquo;t taking bookings.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
