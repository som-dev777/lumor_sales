import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { AvailabilityForm } from "@/components/calendar/AvailabilityForm";
import { CalendarTabs } from "@/components/calendar/CalendarTabs";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { todayIst } from "@/lib/time";
import { appUrl } from "@/lib/tokens";
import { profileView } from "@/server/calendar";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="When people can book you. Your existing bookings always block their time."
      />
      <CalendarTabs current="/calendar/availability" />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Availability />
      </Suspense>
    </>
  );
}

async function Availability() {
  const viewer = await requireUser();
  await connection();
  const profile = await profileView(getDb(), viewer);
  return <AvailabilityForm initial={profile} baseUrl={appUrl()} today={todayIst(await appNow())} />;
}
