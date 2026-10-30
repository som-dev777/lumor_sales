import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ReportButtons } from "@/components/reports/ReportButtons";
import styles from "@/components/reports/reports.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { spanLabel } from "@/lib/report-periods";
import { requireUser } from "@/lib/session";
import { formatIst } from "@/lib/time";
import { aiMode } from "@/server/ai/client";
import { getReport, REPORT_COLUMNS } from "@/server/reports";

export const metadata: Metadata = { title: "Report" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const SECTIONS = [
  {
    title: "Activity",
    keys: ["requests", "messages", "emails", "calls", "callsConnected"],
  },
  {
    title: "Replies and outcomes",
    keys: [
      "replies",
      "meetingsBooked",
      "meetingsHeld",
      "proposals",
      "trials",
      "conversions",
      "dealValueInr",
    ],
  },
  {
    title: "Plan adherence",
    keys: ["stepsDone", "stepsOnTime", "stepsLate", "stepsNotRecorded"],
  },
] as const;

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: Pick<PageProps<"/reports/[id]">, "params">) {
  const viewer = await requireUser();
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const run = await getReport(getDb(), viewer, id);
  if (!run) notFound();
  const r = run.data;
  const rows = [...r.people, r.total];
  const label = (key: string) => REPORT_COLUMNS.find((c) => c.key === key)!.label;

  return (
    <>
      <p className={`${styles.muted} ${styles.noPrint}`}>
        <Link href="/reports">← Reports</Link>
      </p>
      <PageHeader
        title={r.title}
        description={`${spanLabel({ from: r.from, to: r.to })} · made ${formatIst(new Date(r.generatedAt))}${
          run.scheduleId ? " by a schedule" : ""
        }`}
      />
      <ReportButtons id={run.id} canSummarise={!run.aiSummary && aiMode() !== "off"} />

      {run.aiSummary && (
        <section className={styles.card} aria-label="AI summary">
          <h2 className={styles.cardTitle}>AI summary</h2>
          <p className={styles.summary}>{run.aiSummary}</p>
        </section>
      )}

      {SECTIONS.map((section) => (
        <section key={section.title} className={styles.card} aria-label={section.title}>
          <h2 className={styles.cardTitle}>{section.title}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Person</th>
                  {section.keys.map((k) => (
                    <th key={k} className={styles.number}>
                      {label(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, -1).map((p) => (
                  <tr key={p.userId ?? p.name}>
                    <td>{p.name}</td>
                    {section.keys.map((k) => (
                      <td key={k} className={styles.number}>
                        {k === "dealValueInr" ? inr.format(p[k]) : p[k]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {r.scope === "team" && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {section.keys.map((k) => (
                      <td key={k} className={styles.number}>
                        {k === "dealValueInr" ? inr.format(r.total[k]) : r.total[k]}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {section.title === "Plan adherence" && r.total.stepsNotRecorded > 0 && (
            <p className={styles.muted}>Steps done before v2.3.0 have no due date recorded.</p>
          )}
        </section>
      ))}

      <section className={styles.card} aria-label="Funnel">
        <h2 className={styles.cardTitle}>Funnel</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Conversion</th>
                <th className={styles.number}>From</th>
                <th className={styles.number}>To</th>
                <th className={styles.number}>Rate</th>
                <th className={styles.number}>Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {r.funnel.conversions.map((c) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className={styles.number}>{c.from}</td>
                  <td className={styles.number}>{c.to}</td>
                  <td className={`${styles.number} ${c.status === "below" ? styles.below : ""}`}>
                    {pct(c.rate)}
                    {c.status === "low" ? " (low sample)" : ""}
                  </td>
                  <td className={styles.number}>{pct(c.benchmark)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card} aria-label="Plan performance">
        <h2 className={styles.cardTitle}>Plan performance</h2>
        {r.plans.length === 0 ? (
          <p className={styles.muted}>No plan activity in this period.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className={styles.number}>Enrolled</th>
                  <th className={styles.number}>Replied</th>
                  <th className={styles.number}>Reply rate</th>
                  <th>By step (done → replies)</th>
                </tr>
              </thead>
              <tbody>
                {r.plans.map((p) => (
                  <tr key={p.planId}>
                    <td>{p.name}</td>
                    <td className={styles.number}>{p.enrolled}</td>
                    <td className={styles.number}>{p.replied}</td>
                    <td className={styles.number}>{pct(p.replyRate)}</td>
                    <td>
                      {p.steps.length
                        ? p.steps
                            .map((s) => `Step ${s.order}: ${s.done} → ${s.replies}`)
                            .join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
