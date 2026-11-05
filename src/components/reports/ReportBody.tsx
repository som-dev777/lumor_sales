"use client";

import { Pencil, Undo2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { applyEdits, type ReportEdits, type ReportSection } from "@/lib/report-shape";
import { formatIst } from "@/lib/time";
import { includeReportSection, saveReportNumbers } from "@/server/actions/reports";
import {
  eventsTitle,
  headlines,
  NUMBER_SECTIONS,
  PIPELINE_COLUMNS,
  REPORT_COLUMNS,
} from "@/lib/report-columns";
import type { ReportData } from "@/server/reports";
import styles from "./reports.module.scss";

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
          <div className={styles.kpis}>
            {headlines(shown).map((h) => (
              <div key={h.key} className={styles.kpi}>
                <span className={styles.kpiValue}>
                  {h.value === null ? "—" : num(h.key, h.value, `${h.label} (total)`)}
                </span>
                <span className={styles.kpiLabel}>{h.label}</span>
              </div>
            ))}
          </div>
          <p className={styles.muted}>
            New outreach: people added, sent a connection request or contacted for the first time.
            Follow-ups: people contacted before and contacted again. Responded: people who replied
            or interacted back. Demos: meetings booked and held.
          </p>
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
                        {x[c.key] === undefined
                          ? "—"
                          : num(
                              `pipeline.${rowKey(x)}.${c.key}`,
                              x[c.key]!,
                              `${x.name} · ${c.label}`,
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
                    {PIPELINE_COLUMNS.map((c) => (
                      <td key={c.key} className={styles.number}>
                        {p.total[c.key] === undefined
                          ? "—"
                          : num(`pipeline.total.${c.key}`, p.total[c.key]!, `Total · ${c.label}`)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
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
        </Section>
      ))}

      {shown.events ? (
        <Section id="details" title={eventsTitle(shown)} {...{ reportId, hidden, canShape }}>
          <Events events={shown.events} />
        </Section>
      ) : shown.details ? (
        <Section id="details" title="What happened" {...{ reportId, hidden, canShape }}>
          <Details details={shown.details} />
        </Section>
      ) : (
        <p className={styles.muted}>
          This report was made before Events of the day existed. Make a new report to see each
          company and person, with a summary of where things stand.
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
  const [, start] = useTransition();
  // What the server says, and what's on screen: a click shows at once; a failure puts it back.
  const fromServer = !hidden.includes(id);
  const [state, setState] = useState({ fromServer, included: fromServer });
  if (state.fromServer !== fromServer) setState({ fromServer, included: fromServer });
  const included = state.included;
  const toggle = (next: boolean) => {
    setState((s) => ({ ...s, included: next }));
    start(async () => {
      const r = await includeReportSection(reportId, id, next);
      if (!r.ok) setState((s) => ({ ...s, included: !next }));
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Saved.") : r.error);
    });
  };
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
              aria-label={`Include ${title} in the report`}
              onChange={(e) => toggle(e.target.checked)}
            />
            Include in report
          </label>
        )}
      </div>
      {included ? (
        children
      ) : (
        <div className={styles.excludedNote}>
          <p className={styles.muted}>Left out of the PDF, CSV, email and print.</p>
          {canShape && (
            <Button variant="secondary" onClick={() => toggle(true)}>
              Include it again
            </Button>
          )}
        </div>
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

/** Events of the day (D-058): company by company, new ones marked, with a summary per person. */
function Events({ events }: { events: NonNullable<ReportData["events"]> }) {
  const c = events.counts;
  const tiles = [
    { label: "Companies added", value: c.companies },
    { label: "People added", value: c.people },
    { label: "Contacts", value: c.contacts },
    { label: "Replies", value: c.replies },
    { label: "Meetings and demos", value: c.meetings },
  ];
  return (
    <div className={styles.details}>
      <div className={styles.kpis}>
        {tiles.map((t) => (
          <div key={t.label} className={styles.kpi}>
            <span className={styles.kpiValue}>{t.value}</span>
            <span className={styles.kpiLabel}>{t.label}</span>
          </div>
        ))}
      </div>
      {events.companies.length === 0 ? (
        <p className={styles.muted}>Nothing happened in this period.</p>
      ) : (
        <ul className={styles.companies} aria-label="Companies and people">
          {events.companies.map((co) => (
            <li key={co.companyId ?? "none"} className={styles.company} aria-label={co.name}>
              <h3 className={styles.companyName}>
                {co.companyId ? (
                  <Link href={`/companies/${co.companyId}`}>{co.name}</Link>
                ) : (
                  co.name
                )}
                {co.isNew && <span className={styles.newPill}>New</span>}
              </h3>
              {co.people.length === 0 ? (
                <p className={styles.muted}>No people added yet.</p>
              ) : (
                <ul className={styles.eventPeople}>
                  {co.people.map((x) => (
                    <li key={x.personId} className={styles.eventPerson} aria-label={x.name}>
                      <p className={styles.personLine}>
                        <Link href={`/people/${x.personId}`}>{x.name}</Link>
                        {x.title ? <span className={styles.muted}>, {x.title}</span> : null}
                        {x.isNew && <span className={styles.newPill}>New</span>}
                      </p>
                      <p className={styles.facts}>{x.facts.join(" · ")}</p>
                      {x.summary && (
                        <dl className={styles.summaryList}>
                          {x.summary.offered && (
                            <>
                              <dt>Offered</dt>
                              <dd>{x.summary.offered}</dd>
                            </>
                          )}
                          {x.summary.theySaid && (
                            <>
                              <dt>They said</dt>
                              <dd>{x.summary.theySaid}</dd>
                            </>
                          )}
                          {x.summary.outlook && (
                            <>
                              <dt>Outlook</dt>
                              <dd>{x.summary.outlook}</dd>
                            </>
                          )}
                          {x.summary.nextStep && (
                            <>
                              <dt>Next step</dt>
                              <dd>{x.summary.nextStep}</dd>
                            </>
                          )}
                        </dl>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {events.more > 0 && (
        <p className={styles.muted}>{events.more} more people aren&rsquo;t listed.</p>
      )}
      {events.withoutSummary > 0 && (
        <p className={styles.muted}>
          {events.withoutSummary} {events.withoutSummary === 1 ? "person is" : "people are"} shown
          with the facts only (the AI summary was over the limit, off or too slow).
        </p>
      )}
    </div>
  );
}
