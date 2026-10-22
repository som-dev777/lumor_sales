import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { TeamTable } from "@/components/today/TeamTable";
import { TodayList } from "@/components/today/TodayList";
import styles from "@/components/today/today.module.scss";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { appNow } from "@/lib/clock";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate } from "@/lib/time";
import { aiMode } from "@/server/ai/client";
import { buildTeam, buildToday } from "@/server/today";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Today" description="What to do today, in order." />
          <StatusMessage title="Building your list…" />
        </>
      }
    >
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const viewer = await requireUser();
  await connection();
  const params = await searchParams;
  const teamView =
    can(viewer, "today.team") &&
    (Array.isArray(params.tab) ? params.tab[0] : params.tab) === "team";
  const now = await appNow();
  const plan = await buildToday(getDb(), viewer, now);
  return (
    <>
      <PageHeader
        title="Today"
        description={
          teamView
            ? `Where the team stands on ${formatIstDate(plan.today, "EEEE d MMMM")}.`
            : `Your list for ${formatIstDate(plan.today, "EEEE d MMMM")}.`
        }
      />
      {can(viewer, "today.team") && (
        <nav className={styles.tabs} aria-label="Today views">
          <Link
            href="/"
            className={teamView ? styles.tab : styles.tabActive}
            aria-current={teamView ? undefined : "page"}
          >
            My day
          </Link>
          <Link
            href="/?tab=team"
            className={teamView ? styles.tabActive : styles.tab}
            aria-current={teamView ? "page" : undefined}
          >
            Team
          </Link>
        </nav>
      )}
      {teamView ? (
        <TeamTable rows={await buildTeam(getDb(), viewer, now)} />
      ) : (
        <TodayList tasks={plan.tasks} outreach={plan.outreach} aiReady={aiMode() !== "off"} />
      )}
    </>
  );
}
