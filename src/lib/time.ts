// Every date in the app is shown and reasoned about in India time (PRD: Asia/Kolkata).
// The database stores moments as UTC; plain calendar dates are "YYYY-MM-DD" strings in IST.
import { addDays, addMonths, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export const TIME_ZONE = "Asia/Kolkata";

/** A plain IST calendar date, e.g. "2026-10-16". */
export type IstDate = string;

/** The IST calendar date of a moment. */
export function toIstDate(moment: Date): IstDate {
  return formatInTimeZone(moment, TIME_ZONE, "yyyy-MM-dd");
}

/** Today's date in India. */
export function todayIst(now: Date = new Date()): IstDate {
  return toIstDate(now);
}

/** Adds (or subtracts) whole days to a plain date. Pure calendar maths, no time zones involved. */
export function addDaysIst(date: IstDate, days: number): IstDate {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The moment an IST calendar day starts (00:00 IST), as a UTC Date. */
export function istMidnight(date: IstDate): Date {
  return fromZonedTime(`${date}T00:00:00`, TIME_ZONE);
}

/** Formats a moment for people to read, in IST. Default: "16 Oct 2026, 2:30 pm". */
export function formatIst(moment: Date, pattern = "d MMM yyyy, h:mm aaa"): string {
  return formatInTimeZone(moment, TIME_ZONE, pattern);
}

/** Formats a plain date for people to read. Default: "16 Oct 2026". */
export function formatIstDate(date: IstDate, pattern = "d MMM yyyy"): string {
  return formatInTimeZone(istMidnight(date), TIME_ZONE, pattern);
}

/** A time range [start, end): start included, end excluded. Both are UTC moments. */
export type Range = { start: Date; end: Date };

/** One IST calendar day. */
export function istDayRange(date: IstDate): Range {
  return { start: istMidnight(date), end: istMidnight(addDaysIst(date, 1)) };
}

/** From the start of one IST date to the end of another (both included). */
export function istDateSpan(from: IstDate, to: IstDate): Range {
  return { start: istMidnight(from), end: istMidnight(addDaysIst(to, 1)) };
}

/** The IST week (Monday 00:00 to next Monday 00:00) containing `now`. */
export function istWeekRange(now: Date = new Date()): Range {
  const monday = startOfWeek(toZonedTime(now, TIME_ZONE), { weekStartsOn: 1 });
  const start = fromZonedTime(monday, TIME_ZONE);
  return { start, end: fromZonedTime(addDays(monday, 7), TIME_ZONE) };
}

/** The IST calendar month containing `now`. */
export function istMonthRange(now: Date = new Date()): Range {
  const first = startOfMonth(toZonedTime(now, TIME_ZONE));
  return {
    start: fromZonedTime(first, TIME_ZONE),
    end: fromZonedTime(addMonths(first, 1), TIME_ZONE),
  };
}

/** True if the text is a real calendar date in "YYYY-MM-DD" form. */
export function isIstDate(value: string): value is IstDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
