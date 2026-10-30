// Report periods and schedule times (F19). Everything is in IST; plain dates are "YYYY-MM-DD".
// Quarters and half-years follow the calendar (D-039).
import type { ReportFrequency } from "@/lib/db/enums";
import { addDaysIst, formatIstDate, fromIstLocal, isIstDate, todayIst } from "@/lib/time";

export const REPORT_PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "half", label: "This half-year" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number]["key"];

/** A period: both dates included. */
export type DateSpan = { from: string; to: string };

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const parts = (date: string) => date.split("-").map(Number) as [number, number, number];
/** 1 = Monday … 7 = Sunday. */
export const isoWeekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const lastOfMonth = (y: number, m: number) =>
  addDaysIst(ymd(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 1), -1);

/** The calendar period of `size` months (1, 3, 6 or 12) that contains `date`. */
function monthBlock(date: string, size: number): DateSpan {
  const [y, m] = parts(date);
  const first = Math.floor((m - 1) / size) * size + 1;
  return { from: ymd(y, first, 1), to: lastOfMonth(y, first + size - 1) };
}

function weekOf(date: string): DateSpan {
  const from = addDaysIst(date, 1 - isoWeekday(date));
  return { from, to: addDaysIst(from, 6) };
}

/** The dates a preset covers on `today`. Custom needs a valid From ≤ To. */
export function presetSpan(preset: ReportPreset, today: string, custom?: DateSpan): DateSpan {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week":
      return weekOf(today);
    case "month":
      return monthBlock(today, 1);
    case "quarter":
      return monthBlock(today, 3);
    case "half":
      return monthBlock(today, 6);
    case "year":
      return monthBlock(today, 12);
    case "custom":
      if (!custom || !isIstDate(custom.from) || !isIstDate(custom.to) || custom.from > custom.to)
        throw new Error("Pick a From date on or before the To date.");
      return custom;
  }
}

/** "1 Oct – 31 Dec 2026", or one date when From = To. */
export function spanLabel({ from, to }: DateSpan): string {
  if (from === to) return formatIstDate(from);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${formatIstDate(from, sameYear ? "d MMM" : "d MMM yyyy")} – ${formatIstDate(to)}`;
}

const MONTHS: Record<ReportFrequency, number> = {
  Daily: 0,
  Weekly: 0,
  Monthly: 1,
  Quarterly: 3,
  "Half-yearly": 6,
  Yearly: 12,
};

/**
 * What a scheduled run covers (D-039): Daily = the day it runs; the others = the previous full
 * week, month, quarter, half-year or year.
 */
export function scheduleSpan(frequency: ReportFrequency, runDay: string): DateSpan {
  if (frequency === "Daily") return { from: runDay, to: runDay };
  if (frequency === "Weekly") return weekOf(addDaysIst(weekOf(runDay).from, -1));
  const current = monthBlock(runDay, MONTHS[frequency]);
  return monthBlock(addDaysIst(current.from, -1), MONTHS[frequency]);
}

/** True if a schedule runs on this IST date. */
function runsOn(s: { frequency: ReportFrequency; day: number | null }, date: string): boolean {
  const [, m, d] = parts(date);
  switch (s.frequency) {
    case "Daily":
      return true;
    case "Weekly":
      return isoWeekday(date) === (s.day ?? 1);
    default:
      return d === (s.day ?? 1) && (m - 1) % MONTHS[s.frequency] === 0;
  }
}

/** The first run strictly after `after`, at the schedule's IST time. */
export function nextRunAt(
  s: { frequency: ReportFrequency; timeOfDay: string; day: number | null },
  after: Date,
): Date {
  let date = todayIst(after);
  for (let i = 0; i < 400; i++, date = addDaysIst(date, 1)) {
    if (!runsOn(s, date)) continue;
    const at = fromIstLocal(`${date}T${s.timeOfDay}`);
    if (at && at.getTime() > after.getTime()) return at;
  }
  throw new Error("This schedule never runs.");
}
