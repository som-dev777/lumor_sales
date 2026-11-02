// Which booking slots are free (F22). Pure functions, no database: the rep's weekly hours (IST),
// days off and existing bookings in; the start times on offer out.
import { addDaysIst, fromIstLocal, toIstDate, todayIst, type IstDate } from "./time";

export type TimeRange = { start: string; end: string };
export type WeeklyHours = Record<string, TimeRange[]>;

export type SlotRules = {
  durationMin: number;
  bufferMin: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  maxPerDay: number | null;
};

/** A confirmed booking that blocks time: its own gap after it counts too. */
export type Busy = { start: Date; end: Date; bufferMin: number; meetingTypeId: string };

/** Monday to Friday, 10:00–18:00 IST: every rep's starting hours. */
export const DEFAULT_HOURS: WeeklyHours = {
  "1": [{ start: "10:00", end: "18:00" }],
  "2": [{ start: "10:00", end: "18:00" }],
  "3": [{ start: "10:00", end: "18:00" }],
  "4": [{ start: "10:00", end: "18:00" }],
  "5": [{ start: "10:00", end: "18:00" }],
  "6": [],
  "7": [],
};

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const MINUTE = 60_000;

/** "HH:mm" → minutes after midnight, or null if it isn't a time. */
export function minutesOf(time: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Slots start every 15 minutes for meetings up to 20 minutes long, otherwise every 30. */
export function slotStep(durationMin: number): number {
  return durationMin <= 20 ? 15 : 30;
}

/** ISO weekday of a plain date: 1 Monday … 7 Sunday. */
export function isoWeekday(date: IstDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** Checks one day's ranges: real times, start before end, no overlaps. Null when fine. */
export function checkRanges(ranges: TimeRange[]): string | null {
  const parsed = ranges.map((r) => ({ s: minutesOf(r.start), e: minutesOf(r.end) }));
  if (parsed.some((r) => r.s === null || r.e === null)) return "Use times like 09:30.";
  if (parsed.some((r) => r.e! <= r.s!)) return "Each range must end after it starts.";
  const sorted = [...parsed].sort((a, b) => a.s! - b.s!);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].s! < sorted[i - 1].e!) return "Ranges on the same day can't overlap.";
  }
  return null;
}

/** True when two blocks of time overlap (end-exclusive). */
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/** True when a slot starting at `start` is free under these rules. */
export function slotIsFree(
  start: Date,
  rules: SlotRules,
  busy: Busy[],
  meetingTypeId: string,
): boolean {
  const s = start.getTime();
  const e = s + rules.durationMin * MINUTE;
  // Each side's gap after its meeting keeps the two apart.
  return (
    !busy.some((b) =>
      overlaps(
        s,
        e + rules.bufferMin * MINUTE,
        b.start.getTime(),
        b.end.getTime() + b.bufferMin * MINUTE,
      ),
    ) && !dayIsFull(toIstDate(start), rules, busy, meetingTypeId)
  );
}

function dayIsFull(date: IstDate, rules: SlotRules, busy: Busy[], meetingTypeId: string) {
  if (!rules.maxPerDay) return false;
  const booked = busy.filter(
    (b) => b.meetingTypeId === meetingTypeId && toIstDate(b.start) === date,
  ).length;
  return booked >= rules.maxPerDay;
}

/**
 * Every free start time from now to "how far ahead", in order. A slot fits inside one range,
 * starts at least the minimum notice from now, isn't on a day off, doesn't overlap a booking
 * (with gaps), and the day hasn't reached the meeting type's limit.
 */
export function availableSlots({
  hours,
  daysOff,
  rules,
  busy,
  meetingTypeId,
  now,
}: {
  hours: WeeklyHours;
  daysOff: string[];
  rules: SlotRules;
  busy: Busy[];
  meetingTypeId: string;
  now: Date;
}): Date[] {
  const today = todayIst(now);
  const earliest = now.getTime() + rules.minNoticeHours * 60 * MINUTE;
  const step = slotStep(rules.durationMin);
  const off = new Set(daysOff);
  const slots: Date[] = [];
  for (let d = 0; d <= rules.maxDaysAhead; d++) {
    const date = addDaysIst(today, d);
    if (off.has(date) || dayIsFull(date, rules, busy, meetingTypeId)) continue;
    for (const range of hours[String(isoWeekday(date))] ?? []) {
      const from = minutesOf(range.start);
      const to = minutesOf(range.end);
      if (from === null || to === null) continue;
      for (let t = from; t + rules.durationMin <= to; t += step) {
        const start = fromIstLocal(`${date}T${hhmm(t)}`)!;
        if (start.getTime() < earliest) continue;
        if (slotIsFree(start, rules, busy, meetingTypeId)) slots.push(start);
      }
    }
  }
  return slots;
}

/** True when `start` is one of the slots on offer right now (checked again when booking). */
export function isOffered(start: Date, args: Parameters<typeof availableSlots>[0]): boolean {
  return availableSlots(args).some((s) => s.getTime() === start.getTime());
}

/**
 * The next range after `last`: half an hour after it ends, as long as it (at most an hour), e.g.
 * 11:00–11:30 → 12:00–12:30. Null when the day has no room left.
 */
export function nextRange(last: TimeRange): TimeRange | null {
  const s = minutesOf(last.start);
  const e = minutesOf(last.end);
  if (s === null || e === null) return { start: "10:00", end: "18:00" };
  const length = Math.min(60, Math.max(15, e - s));
  const start = e + 30;
  if (start + 15 > 23 * 60 + 59) return null;
  const end = Math.min(start + length, 23 * 60 + 59);
  return { start: hhmm(start), end: hhmm(end) };
}
