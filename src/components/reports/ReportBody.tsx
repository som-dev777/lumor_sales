"use client";

import { Pencil, Undo2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { applyEdits, type ReportEdits, type ReportSection } from "@/lib/report-shape";
import { formatIst } from "@/lib/time";
import { includeReportSection, saveReportNumbers } from "@/server/actions/reports";
import { NUMBER_SECTIONS, PIPELINE_COLUMNS, REPORT_COLUMNS } from "@/lib/report-columns";
import type { ReportData } from "@/server/reports";
import { OutreachChart, StageChart } from "./ReportCharts";
import styles from "./reports.module.scss";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const when = (iso: string) => formatIst(new Date(iso), "d MMM, h:mm aaa");

/**
 * A saved report's sections (F19, D-057): each can be left out of the downloads, and the
 * report's maker (or an Admin) can edit its numbers on this report only.
 */
export function ReportBody({
  reportId,
  data,
  edits,
  hidden,
  canShape,
  aiSummary,
}: {
  reportId: string;
  /** The report as made (edits are laid over it here). */
  data: ReportData;
  edits: ReportEdits;
  hidden: ReportSection[];
  canShape: boolean;
  aiSummary: string | null;
}) {
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ReportEdits>(edits);
  const [busy, start] = useTransition();
  const shown = useMemo(
    () => applyEdits(data, editing ? draft : edits),
    [data, edits, draft, editing],
  );
  const original = data;
  const edited = (key: string) => key in (editing ? draft : edits);

  /** A number cell: a box while editing, else the value (marked when edited). */
  const num = (key: string, value: number, label: string, money = false) =>
    editing ? (
      <input
        type="number"
        min={0}
        step={1}
        className={styles.numInput}
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = e.target.value === "" ? 0 : Math.max(0, Math.round(Number(e.target.value)));
          setDraft((d) => ({ ...d, [key]: n }));
        }}
      />
    ) : (
      <span
        className={edited(key) ? styles.edited : undefined}
        title={edited(key) ? "Edited" : undefined}
      >
        {money ? inr.format(value) : value}
        {edited(key) && <span className={styles.srOnly}> (edited)</span>}
      </span>
    );

  const save = (next: ReportEdits) =>
    start(async () => {
      const r = await saveReportNumbers(reportId, next);
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Saved.") : r.error);
      if (r.ok) setEditing(false);
    });

  const rowKey = (r: { userId: string | null }) => r.userId ?? "total";
  const p = shown.pipeline;
  const editedCount = Object.keys(edits).length;

  return (
    <>
      {canShape && (
        <div className={`${styles.editBar} ${styles.noPrint}`}>
          {editing ? (
            <>
              <Button loading={busy} onClick={() => save(draft)}>
                Save numbers
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setDraft(edits);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <span className={styles.muted}>
                Changes stay on this report only; the app&rsquo;s data isn&rsquo;t changed.
              </span>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft(edits);
                  setEditing(true);
                }}
              >
                <Pencil size={16} aria-hidden /> Edit numbers
              </Button>
              {editedCount > 0 && (
                <>
                  <span className={styles.muted}>
                    {editedCount} number{editedCount === 1 ? "" : "s"} edited (marked).
                  </span>
                  <Button variant="ghost" loading={busy} onClick={() => save({})}>
                    <Undo2 size={16} aria-hidden /> Undo all edits
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {aiSummary && (
        <Section id="summary" title="AI summary" {...{ reportId, hidden, canShape }}>
          <p className={styles.summary}>{aiSummary}</p>
        </Section>
      )}

      {p && (
        <Section id="pipeline" title="Pipeline" {...{ reportId, hidden, canShape }}>
          <OutreachChart
            data={p.people.map((x, i) => ({
              name: x.name,
              outreach: x.newOutreach,
              replied: x.replied,
              meetings: shown.people[i]?.meetingsBooked ?? 0,
            }))}
          />
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Person</th>
                  {PIPELINE_COLUMNS.map((c) => (
                    <th key={c.key} className={styles.number}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.people.map((x) => (
                  <tr key={rowKey(x)}>
                    <td>{x.name}</td>
                    {PIPELINE_COLUMNS.map((c) => (
                      <td key={c.key} className={styles.number}>
                        {num(`pipeline.${rowKey(x)}.${c.key}`, x[c.key], `${x.name} · ${c.label}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {shown.scope === "team" && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {PIPELINE_COLUMNS.map((c) => (
                      <td key={c.key} className={styles.number}>
                        {num(`pipeline.total.${c.key}`, p.total[c.key], `Total · ${c.label}`)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className={styles.muted}>
            New outreach: people added, sent a connection request or contacted for the first time in
            the period (the same rule as Today). Replied: people who replied. Converted: marked
            converted or moved to Paid. No response yet: new outreach with no reply.
          </p>
          {Object.keys(p.total.stages).length > 0 && (
            <>
              <h3 className={styles.cardTitle}>Where their people stand now</h3>
              <StageChart
                data={Object.entries(p.total.stages)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => ({ stage, count }))}
              />
            </>
          )}
        </Section>
      )}

      {NUMBER_SECTIONS.map((sec) => (
        <Section key={sec.key} id={sec.key} title={sec.title} {...{ reportId, hidden, canShape }}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Person</th>
                  {sec.keys.map((k) => (
                    <th key={k} className={styles.number}>
                      {REPORT_COLUMNS.find((c) => c.key === k)!.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.people.map((x) => (
                  <tr key={rowKey(x)}>
                    <td>{x.name}</td>
                    {sec.keys.map((k) => (
                      <td key={k} className={styles.number}>
                        {num(
                          `numbers.${rowKey(x)}.${k}`,
                          x[k],
                          `${x.name} · ${REPORT_COLUMNS.find((c) => c.key === k)!.label}`,
                          k === "dealValueInr",
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {shown.scope === "team" && (
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {sec.keys.map((k) => (
                      <td key={k} className={styles.number}>
                        {num(
                          `numbers.total.${k}`,
                          shown.total[k],
                          `Total · ${REPORT_COLUMNS.find((c) => c.key === k)!.label}`,
                          k === "dealValueInr",
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {sec.key === "adherence" && original.total.stepsNotRecorded > 0 && (
            <p className={styles.muted}>Steps done before v2.3.0 have no due date recorded.</p>
          )}
        </Section>
      ))}

      <Section id="funnel" title="Funnel" {...{ reportId, hidden, canShape }}>
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
              {shown.funnel.conversions.map((c, i) => (
                <tr key={c.label}>
                  <td>{c.label}</td>
                  <td className={styles.number}>
                    {num(`funnel.${i}.from`, c.from, `${c.label} · From`)}
                  </td>
                  <td className={styles.number}>
                    {num(`funnel.${i}.to`, c.to, `${c.label} · To`)}
                  </td>
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
      </Section>

      <Section id="plans" title="Plan performance" {...{ reportId, hidden, canShape }}>
        {shown.plans.length === 0 ? (
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
                {shown.plans.map((pl) => (
                  <tr key={pl.planId}>
                    <td>{pl.name}</td>
                    <td className={styles.number}>
                      {num(`plans.${pl.planId}.enrolled`, pl.enrolled, `${pl.name} · Enrolled`)}
                    </td>
                    <td className={styles.number}>
                      {num(`plans.${pl.planId}.replied`, pl.replied, `${pl.name} · Replied`)}
                    </td>
                    <td className={styles.number}>{pct(pl.replyRate)}</td>
                    <td>
                      {pl.steps.length
                        ? pl.steps
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
      </Section>

      {shown.details ? (
        <Section id="details" title="What happened" {...{ reportId, hidden, canShape }}>
          <Details details={shown.details} />
        </Section>
      ) : (
        <p className={styles.muted}>
          This report was made before the What happened section existed. Make a new report to see
          who was contacted and what was sent.
        </p>
      )}
    </>
  );
}

/** A report section with its Include in report switch (D-057). */
function Section({
  id,
  title,
  reportId,
  hidden,
  canShape,
  children,
}: {
  id: ReportSection;
  title: string;
  reportId: string;
  hidden: ReportSection[];
  canShape: boolean;
  children: React.ReactNode;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  // Flips at once; the server's answer then confirms it (or puts it back).
  const [included, setIncluded] = useOptimistic(!hidden.includes(id));
  return (
    <section
      className={`${styles.card} ${included ? "" : `${styles.excluded} ${styles.noPrint}`}`}
      aria-label={title}
    >
      <div className={styles.sectionHead}>
        <h2 className={styles.cardTitle}>{title}</h2>
        {canShape && (
          <label className={`${styles.switch} ${styles.noPrint}`}>
            <input
              type="checkbox"
              role="switch"
              checked={included}
              disabled={busy}
              aria-label={`Include ${title} in the report`}
              onChange={(e) => {
                const next = e.target.checked;
                start(async () => {
                  setIncluded(next);
                  const r = await includeReportSection(reportId, id, next);
                  notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Saved.") : r.error);
                });
              }}
            />
            Include in report
          </label>
        )}
      </div>
      {included ? (
        children
      ) : (
        <p className={styles.muted}>
          Left out of the PDF, CSV, email and print. Switch it back on to include it.
        </p>
      )}
    </section>
  );
}

function Details({ details }: { details: NonNullable<ReportData["details"]> }) {
  const d = details;
  const total = (n: number, more: number) => n + more;
  return (
    <div className={styles.details}>
      <p className={styles.muted}>
        {total(d.companies.length, d.more.companies)} companies added ·{" "}
        {total(d.people.length, d.more.people)} people added ·{" "}
        {total(d.actions.length, d.more.actions)} contacts, replies and meetings
      </p>

      <h3 className={styles.subTitle}>Companies added</h3>
      {d.companies.length === 0 ? (
        <p className={styles.muted}>None.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Companies added">
            <thead>
              <tr>
                <th>Company</th>
                <th>Added by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {d.companies.map((c) => (
                <tr key={c.companyId}>
                  <td>
                    <Link href={`/companies/${c.companyId}`}>{c.name}</Link>
                  </td>
                  <td>{c.by ?? "—"}</td>
                  <td className={styles.nowrap}>{when(c.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.subTitle}>People added</h3>
      {d.people.length === 0 ? (
        <p className={styles.muted}>None.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="People added">
            <thead>
              <tr>
                <th>Person</th>
                <th>Title</th>
                <th>Company</th>
                <th>Added by</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {d.people.map((x) => (
                <tr key={x.personId}>
                  <td>
                    <Link href={`/people/${x.personId}`}>{x.name}</Link>
                  </td>
                  <td>{x.title ?? "—"}</td>
                  <td>{x.company ?? "—"}</td>
                  <td>{x.by ?? "—"}</td>
                  <td className={styles.nowrap}>{when(x.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className={styles.subTitle}>Contacts, replies and meetings</h3>
      {d.actions.length === 0 ? (
        <p className={styles.muted}>None.</p>
      ) : (
        <ol className={styles.actionList} aria-label="Contacts, replies and meetings">
          {d.actions.map((a, i) => (
            <li key={i} className={styles.action}>
              <p className={styles.actionHead}>
                <span className={styles.nowrap}>{when(a.at)}</span> · {a.rep} ·{" "}
                <strong>{a.what}</strong> ·{" "}
                {a.personId ? (
                  <Link href={`/people/${a.personId}`}>{a.person}</Link>
                ) : (
                  (a.person ?? "—")
                )}
                {a.company ? ` (${a.company})` : ""}
              </p>
              {a.text && <p className={styles.actionText}>{a.text}</p>}
            </li>
          ))}
        </ol>
      )}
      {d.more.companies + d.more.people + d.more.actions > 0 && (
        <p className={styles.muted}>
          {d.more.companies + d.more.people + d.more.actions} more rows aren&rsquo;t listed (the
          first 500 of each list are). The CSV has the same rows.
        </p>
      )}
    </div>
  );
}
