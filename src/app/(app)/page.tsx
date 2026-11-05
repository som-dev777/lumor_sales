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
import { formatIstDate, todayIst } from "@/lib/time";
import { aiMode } from "@/server/ai/client";
import {
  buildDay,
  loggedOn,
  buildTeam,
  buildToday,
  DAY_RANGE,
  pickDay,
  TEAM_DETAILS,
  teamDetail,
  type TeamDetail,
} from "@/server/today";
import { DayNav } from "@/components/today/DayNav";
import { DayView } from "@/components/today/DayView";
import { LoggedList } from "@/components/today/LoggedList";
import { meetingsToday } from "@/server/calendar";
import { TodayMeetings } from "@/components/calendar/TodayMeetings";
import { AutoRefresh } from "@/components/shell/AutoRefresh";

export const metadata: Metadata = { title: "My tasks" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function TodayPage({ searchParams }: PageProps<"/">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="My tasks" description="What to do today, in order." />
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
  // Previous day / Next day (D-057): ?day=YYYY-MM-DD, up to 7 days either way.
  const day = teamView ? null : pickDay(one(params.day), todayIst(now));
  const [plan, meetings, dayView, loggedToday] = await Promise.all([
    buildToday(getDb(), viewer, now),
    meetingsToday(getDb(), viewer.id, day ? new Date(`${day}T06:30:00Z`) : now),
    day ? buildDay(getDb(), viewer, day, now) : null,
    // What you logged today, with each follow-up date to change (D-059).
    day || teamView ? [] : loggedOn(getDb(), viewer, todayIst(now)),
  ]);
  return (
    <>
      {/* Meetings booked or cancelled during the day show up without reloading (D-054). */}
      <AutoRefresh />
      <PageHeader
        title="My tasks"
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
            My tasks
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
      ) : dayView ? (
        <>
          <DayNav today={plan.today} day={dayView.day} range={DAY_RANGE} />
          <TodayMeetings
            today={meetings}
            title={`Meetings on ${formatIstDate(dayView.day, "EEEE d MMMM")}`}
          />
          <DayView view={dayView} today={plan.today} />
        </>
      ) : (
        <>
          <DayNav today={plan.today} day={plan.today} range={DAY_RANGE} />
          {/* Only what's still to come (D-055): a meeting leaves once its end time passes. */}
          <TodayMeetings
            today={meetings.filter((m) => m.endsAt.getTime() > now.getTime())}
            finished={meetings.filter((m) => m.endsAt.getTime() <= now.getTime()).length}
          />
          <TodayList
            tasks={plan.tasks}
            outreach={plan.outreach}
            aiReady={aiMode() !== "off"}
            today={plan.today}
          />
          <LoggedList title="What you logged today" done={loggedToday} today={plan.today} />
        </>
      )}
    </>
  );
}
