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
import { buildTeam, buildToday, TEAM_DETAILS, teamDetail, type TeamDetail } from "@/server/today";
import { meetingsToday, upcomingMeetings } from "@/server/calendar";
import { TodayMeetings } from "@/components/calendar/TodayMeetings";

export const metadata: Metadata = { title: "Today" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

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
  const teamView = can(viewer, "today.team") && one(params.tab) === "team";
  const now = await appNow();
  // The list behind one Team tab number (D-043): ?tab=team&user=…&show=…
  const detailOf = async () => {
    const userId = one(params.user);
    const show = one(params.show) as TeamDetail | undefined;
    if (!userId || !show || !TEAM_DETAILS.includes(show)) return null;
    try {
      const d = await teamDetail(getDb(), viewer, userId, show, now);
      return { userId, show, ...d };
    } catch {
      return null;
    }
  };
  const [plan, meetings, upcoming] = await Promise.all([
    buildToday(getDb(), viewer, now),
    meetingsToday(getDb(), viewer.id, now),
    upcomingMeetings(getDb(), viewer.id, now),
  ]);
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
        <TeamTable rows={await buildTeam(getDb(), viewer, now)} detail={await detailOf()} />
      ) : (
        <>
          <TodayMeetings today={meetings} upcoming={upcoming} />
          <TodayList
            tasks={plan.tasks}
            outreach={plan.outreach}
            aiReady={aiMode() !== "off"}
            today={plan.today}
          />
        </>
      )}
    </>
  );
}
