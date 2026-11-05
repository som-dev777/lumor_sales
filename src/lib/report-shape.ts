// Shaping a saved report (D-057): which sections go in the downloads, and numbers edited on the
// report only. Pure functions, used by the page, the PDF, the CSV and the email alike. The
// report's own data is never changed; edits are laid over a copy.
import type { ReportData } from "@/server/reports";

export const REPORT_SECTIONS = [
  { key: "summary", label: "AI summary" },
  { key: "pipeline", label: "Pipeline" },
  { key: "activity", label: "Activity" },
  { key: "outcomes", label: "Replies and outcomes" },
  { key: "details", label: "Events" },
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number]["key"];
export const SECTION_KEYS = REPORT_SECTIONS.map((s) => s.key) as ReportSection[];

/** Edited numbers: `pipeline.<row>.<column>`, `numbers.<row>.<key>`, `funnel.<i>.from|to`,
 * `plans.<planId>.enrolled|replied`. `<row>` is the rep's user id, or `total`. */
export type ReportEdits = Record<string, number>;

const PIPELINE_KEYS = [
  "peopleAdded",
  "companiesAdded",
  "newOutreach",
  "followUps",
  "replied",
  "converted",
  "noResponse",
] as const;
const NUMBER_KEYS = [
  "requests",
  "messages",
  "emails",
  "calls",
  "callsConnected",
  "replies",
  "meetingsBooked",
  "meetingsHeld",
  "proposals",
  "trials",
  "conversions",
  "dealValueInr",
  "stepsDone",
  "stepsOnTime",
  "stepsLate",
  "stepsNotRecorded",
] as const;

const rowId = (r: { userId: string | null }) => r.userId ?? "total";

/** Whether `key` names a number in this report that may be edited. */
export function isEditKey(data: ReportData, key: string): boolean {
  const [part, a, b, extra] = key.split(".");
  if (extra !== undefined || !a || !b) return false;
  if (part === "pipeline") {
    const p = data.pipeline;
    return (
      Boolean(p) &&
      (PIPELINE_KEYS as readonly string[]).includes(b) &&
      (a === "total" || p!.people.some((r) => r.userId === a))
    );
  }
  if (part === "numbers") {
    return (
      (NUMBER_KEYS as readonly string[]).includes(b) &&
      (a === "total" || data.people.some((r) => r.userId === a))
    );
  }
  if (part === "funnel") {
    const i = Number(a);
    return (
      Number.isInteger(i) && i >= 0 && i < data.funnel.conversions.length && /^(from|to)$/.test(b)
    );
  }
  if (part === "plans") {
    return data.plans.some((p) => p.planId === a) && /^(enrolled|replied)$/.test(b);
  }
  return false;
}

/** The report with the edits laid over a copy; rates follow edited counts. */
export function applyEdits(data: ReportData, edits: ReportEdits): ReportData {
  const out = structuredClone(data);
  const get = (key: string) => (key in edits ? edits[key] : undefined);
  if (out.pipeline) {
    for (const r of [...out.pipeline.people, out.pipeline.total]) {
      for (const k of PIPELINE_KEYS) {
        const v = get(`pipeline.${rowId(r)}.${k}`);
        if (v !== undefined) r[k] = v;
      }
    }
  }
  for (const r of [...out.people, out.total]) {
    for (const k of NUMBER_KEYS) {
      const v = get(`numbers.${rowId(r)}.${k}`);
      if (v !== undefined) r[k] = v;
    }
  }
  out.funnel.conversions = out.funnel.conversions.map((c, i) => {
    const from = get(`funnel.${i}.from`);
    const to = get(`funnel.${i}.to`);
    if (from === undefined && to === undefined) return c;
    const f = from ?? c.from;
    const t = to ?? c.to;
    const rate = f > 0 ? t / f : null;
    return {
      ...c,
      from: f,
      to: t,
      rate,
      status: f < 10 ? "low" : rate !== null && rate < c.benchmark ? "below" : "ok",
    };
  });
  out.plans = out.plans.map((p) => {
    const enrolled = get(`plans.${p.planId}.enrolled`);
    const replied = get(`plans.${p.planId}.replied`);
    if (enrolled === undefined && replied === undefined) return p;
    const e = enrolled ?? p.enrolled;
    const r = replied ?? p.replied;
    return { ...p, enrolled: e, replied: r, replyRate: e > 0 ? r / e : null };
  });
  return out;
}

/** Checks edits from the browser: known numbers only, whole and not negative. */
export function cleanEdits(data: ReportData, edits: Record<string, unknown>): ReportEdits {
  const out: ReportEdits = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!isEditKey(data, key)) throw new Error(`Unknown number: ${key}`);
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 1_000_000_000) {
      throw new Error("Numbers must be whole and not negative.");
    }
    out[key] = n;
  }
  return out;
}

/** Sections left out of the downloads (unknown keys dropped). */
export function hiddenOf(list: readonly string[] | null | undefined): ReportSection[] {
  return (list ?? []).filter((k): k is ReportSection => (SECTION_KEYS as string[]).includes(k));
}
