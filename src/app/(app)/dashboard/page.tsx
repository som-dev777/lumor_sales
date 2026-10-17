import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import styles from "@/components/dashboard/dashboard.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { assertCan } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import {
  dashboard,
  DIMENSIONS,
  FUNNEL_STAGES,
  periodFor,
  type Conversion,
  type Dimension,
  type PeriodKind,
} from "@/server/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Weekly and monthly funnel, with benchmarks and breakdowns."
      />
      <Suspense fallback={<StatusMessage title="Loading the dashboard…" />}>
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);

function ConversionValue({ c }: { c: Conversion }) {
  if (c.status === "low")
    return (
      <span className={styles.low} title="Fewer than 10 in the earlier stage">
        {pct(c.rate)} <span className={styles.lowTag}>low sample</span>
      </span>
    );
  if (c.status === "below")
    return (
      <span className={styles.below}>
        <AlertTriangle size={14} aria-hidden /> {pct(c.rate)}
        <span className={styles.srOnly}> (below benchmark)</span>
      </span>
    );
  return <span>{pct(c.rate)}</span>;
}

async function Dashboard({ searchParams }: Pick<PageProps<"/dashboard">, "searchParams">) {
  const viewer = await requireUser();
  assertCan(viewer, "record.view");
  await connection();
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v)?.trim();
  };
  const kind: PeriodKind = one("period") === "month" ? "month" : "week";
  const by = (DIMENSIONS.find((d) => d.key === one("by"))?.key ?? "persona") as Dimension;
  const period = periodFor(kind, one("at"));
  const data = await dashboard(getDb(), period, by);

  const href = (over: { period?: PeriodKind; at?: string; by?: Dimension }) => {
    const q = new URLSearchParams({
      period: over.period ?? kind,
      at: over.at ?? period.anchor,
      by: over.by ?? by,
    });
    return `/dashboard?${q}`;
  };
  const totalEvents = Object.values(data.totals).reduce((a, b) => a + b, 0);

  return (
    <>
      <div className={styles.controls}>
        <nav className={styles.segmented} aria-label="Period length">
          {(["week", "month"] as const).map((k) => (
            <Link
              key={k}
              href={href({ period: k })}
              className={k === kind ? styles.segmentActive : styles.segment}
              aria-current={k === kind ? "page" : undefined}
            >
              {k === "week" ? "Week" : "Month"}
            </Link>
          ))}
        </nav>
        <div className={styles.periodNav}>
          <Link
            href={href({ at: period.prev })}
            className={styles.arrow}
            aria-label={`Previous ${kind}`}
          >
            <ChevronLeft size={18} aria-hidden />
          </Link>
          <h2 className={styles.periodLabel}>{period.label}</h2>
          <Link
            href={href({ at: period.next })}
            className={styles.arrow}
            aria-label={`Next ${kind}`}
          >
            <ChevronRight size={18} aria-hidden />
          </Link>
        </div>
      </div>

      <section className={styles.card} aria-label="Funnel">
        <h2 className={styles.cardTitle}>Funnel</h2>
        {totalEvents === 0 ? (
          <p className={styles.empty}>Nothing logged in this {kind} yet.</p>
        ) : (
          <FunnelChart
            data={FUNNEL_STAGES.map((s) => ({ label: s.label, count: data.totals[s.key] }))}
          />
        )}
      </section>

      <section aria-label="Conversions" className={styles.tiles}>
        {data.conversions.map((c) => (
          <div key={c.label} className={c.status === "below" ? styles.tileBelow : styles.tile}>
            <h3 className={styles.tileLabel}>{c.label}</h3>
            <p className={styles.tileValue}>
              <ConversionValue c={c} />
            </p>
            <p className={styles.tileMeta}>
              {c.to} of {c.from} · benchmark {pct(c.benchmark)}
            </p>
          </div>
        ))}
      </section>

      <section className={styles.card} aria-label="Breakdown">
        <div className={styles.breakdownHead}>
          <h2 className={styles.cardTitle}>Break down by</h2>
          <nav className={styles.segmented} aria-label="Break down by">
            {DIMENSIONS.map((d) => (
              <Link
                key={d.key}
                href={href({ by: d.key })}
                className={d.key === by ? styles.segmentActive : styles.segment}
                aria-current={d.key === by ? "page" : undefined}
              >
                {d.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{DIMENSIONS.find((d) => d.key === by)?.label}</th>
                {FUNNEL_STAGES.map((s) => (
                  <th key={s.key} scope="col" className={styles.num}>
                    {s.label}
                  </th>
                ))}
                {data.conversions.map((c) => (
                  <th key={c.label} scope="col" className={styles.num}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className={styles.totalRow}>
                <th scope="row">All</th>
                {FUNNEL_STAGES.map((s) => (
                  <td key={s.key} className={styles.num}>
                    {data.totals[s.key]}
                  </td>
                ))}
                {data.conversions.map((c) => (
                  <td key={c.label} className={styles.num}>
                    <ConversionValue c={c} />
                  </td>
                ))}
              </tr>
              {data.breakdown.map((g) => (
                <tr key={g.key}>
                  <th scope="row">{g.label}</th>
                  {FUNNEL_STAGES.map((s) => (
                    <td key={s.key} className={styles.num}>
                      {g.counts[s.key]}
                    </td>
                  ))}
                  {g.conversions.map((c) => (
                    <td key={c.label} className={styles.num}>
                      <ConversionValue c={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          Counted from activities dated in this period. A conversion turns amber when it is below
          its benchmark and the earlier stage has 10 or more; with fewer, it shows &ldquo;low
          sample&rdquo;. Contacted is each person&rsquo;s first touch of any kind.
        </p>
      </section>

      <section className={styles.card} aria-label="Plans">
        <h2 className={styles.cardTitle}>Plans</h2>
        {data.plans.length === 0 ? (
          <p className={styles.empty}>No plan activity in this {kind}.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Plan</th>
                  <th scope="col" className={styles.num}>
                    Enrolled
                  </th>
                  <th scope="col" className={styles.num}>
                    Replied
                  </th>
                  <th scope="col" className={styles.num}>
                    Reply rate
                  </th>
                  <th scope="col" className={styles.num}>
                    Converted
                  </th>
                  <th scope="col">Reply rate per step (touches → replies)</th>
                </tr>
              </thead>
              <tbody>
                {data.plans.map((p) => (
                  <tr key={p.planId}>
                    <th scope="row">{p.name}</th>
                    <td className={styles.num}>{p.enrolled}</td>
                    <td className={styles.num}>{p.replied}</td>
                    <td className={styles.num}>{pct(p.replyRate)}</td>
                    <td className={styles.num}>{p.converted}</td>
                    <td>
                      {p.steps.length === 0
                        ? "—"
                        : p.steps
                            .map(
                              (s) => `Step ${s.order}: ${s.done} → ${s.replies} (${pct(s.rate)})`,
                            )
                            .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note}>
          Enrolled = people who started the plan in this period. Replies are counted against the
          step that came just before them.
        </p>
      </section>
    </>
  );
}
