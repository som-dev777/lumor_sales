import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TodayList } from "@/components/today/TodayList";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { appNow } from "@/lib/clock";
import { requireUser } from "@/lib/session";
import { formatIstDate } from "@/lib/time";
import { aiMode } from "@/server/ai/client";
import { buildToday } from "@/server/today";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Today" description="What to do today, in order." />
          <StatusMessage title="Building your list…" />
        </>
      }
    >
      <Today />
    </Suspense>
  );
}

async function Today() {
  const viewer = await requireUser();
  await connection();
  const plan = await buildToday(getDb(), viewer, await appNow());
  return (
    <>
      <PageHeader
        title="Today"
        description={`Your list for ${formatIstDate(plan.today, "EEEE d MMMM")}.`}
      />
      <TodayList tasks={plan.tasks} outreach={plan.outreach} aiReady={aiMode() !== "off"} />
    </>
  );
}
