import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { ReportForm } from "@/components/reports/ReportForm";
import { ScheduleActions } from "@/components/reports/ScheduleActions";
import { ScheduleDialog } from "@/components/reports/ScheduleDialog";
import styles from "@/components/reports/reports.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { spanLabel } from "@/lib/report-periods";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { emailConfigured } from "@/server/email";
import { listSchedules } from "@/server/report-schedules";
import { listReports } from "@/server/reports";

export const metadata: Metadata = { title: "Reports" };

const WEEKDAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SEND_TO: Record<string, string> = {
  admins: "Admins",
  emails: "Email list",
  "each-rep": "Each rep",
};

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Activity, outcomes, plan adherence and the funnel for any period. Saved, printable and downloadable."
      />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Reports />
      </Suspense>
    </>
  );
}

async function Reports() {
  const viewer = await requireUser();
  await connection();
  const db = getDb();
  const isAdmin = can(viewer, "reports.team");
  const people = isAdmin
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(eq(user.active, true))
        .orderBy(asc(user.name))
    : null;
  const [history, schedules] = await Promise.all([
    listReports(db, viewer),
    can(viewer, "reports.schedule") ? listSchedules(db) : Promise.resolve(null),
  ]);

  return (
    <>
      <section className={styles.card} aria-label="Make a report">
        <h2 className={styles.cardTitle}>Make a report</h2>
        <ReportForm people={people} />
      </section>

      <section className={styles.card} aria-label="Report history">
        <h2 className={styles.cardTitle}>Report history</h2>
        {history.length === 0 ? (
          <p className={styles.muted}>No reports yet. Make one above.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Period</th>
                  <th>Made</th>
                  <th>Emailed to</th>
                </tr>
              </thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/reports/${r.id}`}>{r.title}</Link>
                    </td>
                    <td>{spanLabel({ from: r.fromDate, to: r.toDate })}</td>
                    <td>
                      {formatIst(r.createdAt)} ·{" "}
                      {r.scheduleId ? "Scheduled" : (r.generatedBy ?? "—")}
                    </td>
                    <td>{r.emailedTo.length ? r.emailedTo.join(", ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {schedules && people && (
        <section className={styles.card} aria-label="Scheduled reports">
          <div className={styles.actions}>
            <h2 className={styles.cardTitle}>Scheduled reports</h2>
            <ScheduleDialog people={people} />
          </div>
          {!emailConfigured() && (
            <p className={styles.muted}>
              Email isn&rsquo;t set up here, so scheduled reports are saved in Report history but
              not emailed. Add RESEND_API_KEY and EMAIL_FROM (see docs/deploy.md).
            </p>
          )}
          {schedules.length === 0 ? (
            <p className={styles.muted}>No schedules yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>When (IST)</th>
                    <th>Report on</th>
                    <th>Send to</th>
                    <th>Next run</th>
                    <th>
                      <span className={styles.srOnly}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedules.map((s) => (
                    <tr key={s.id} aria-label={s.name}>
                      <td>
                        {s.name} {!s.active && <Badge tone="warning">Off</Badge>}
                      </td>
                      <td>
                        {s.frequency}
                        {s.frequency === "Weekly" && s.day ? `, ${WEEKDAYS[s.day]}` : ""}
                        {s.frequency !== "Daily" && s.frequency !== "Weekly" && s.day
                          ? `, day ${s.day}`
                          : ""}
                        , {s.timeOfDay}
                      </td>
                      <td>
                        {s.scope === "team"
                          ? "Whole team"
                          : s.scope === "person"
                            ? (s.personName ?? "One person")
                            : "Each rep"}
                      </td>
                      <td>
                        {s.recipients === "emails" ? s.emails.join(", ") : SEND_TO[s.recipients]}
                      </td>
                      <td>{s.active ? formatIst(s.nextRunAt) : "—"}</td>
                      <td>
                        <div className={styles.actions}>
                          <ScheduleDialog
                            scheduleId={s.id}
                            people={people}
                            initial={{
                              name: s.name,
                              frequency: s.frequency,
                              timeOfDay: s.timeOfDay,
                              day: s.day,
                              scope: s.scope,
                              personUserId: s.personUserId,
                              recipients: s.recipients,
                              emails: s.emails,
                              active: s.active,
                            }}
                          />
                          <ScheduleActions id={s.id} name={s.name} active={s.active} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
