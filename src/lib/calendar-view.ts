// The calendar's month / week / day views (F22 round 2). Pure date maths in IST, so it can be
// tested without a browser.
import { isoWeekday } from "./slots";
import { addDaysIst, isIstDate, istMidnight, toIstDate, type IstDate } from "./time";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export const VIEWS = ["month", "week", "day", "list"] as const;
export type CalendarView = (typeof VIEWS)[number];

/** The time grid shows 06:00–23:00 IST in 15-minute rows. */
export const GRID_START_HOUR = 6;
export const GRID_END_HOUR = 23;
export const GRID_ROWS = (GRID_END_HOUR - GRID_START_HOUR) * 4;

export const parseView = (v: unknown): CalendarView =>
  VIEWS.includes(v as CalendarView) ? (v as CalendarView) : "week";

export const parseDate = (v: unknown, today: IstDate): IstDate =>
  typeof v === "string" && isIstDate(v) ? v : today;

/** Monday of the week containing `date`. */
export const mondayOf = (date: IstDate) => addDaysIst(date, 1 - isoWeekday(date));

/** The days shown, first to last (both included). */
export function daysShown(view: CalendarView, date: IstDate): IstDate[] {
  if (view === "day") return [date];
  if (view === "week" || view === "list") {
    const mon = mondayOf(date);
    return Array.from({ length: 7 }, (_, i) => addDaysIst(mon, i));
  }
  const first = `${date.slice(0, 7)}-01`;
  const start = mondayOf(first);
  const [y, m] = date.split("-").map(Number);
  const last = isoDate(new Date(Date.UTC(y, m, 0)));
  const end = addDaysIst(mondayOf(last), 6);
  const out: IstDate[] = [];
  for (let d = start; d <= end; d = addDaysIst(d, 1)) out.push(d);
  return out;
}

/** The UTC range [start, end) the view covers. */
export function rangeOf(view: CalendarView, date: IstDate) {
  const days = daysShown(view, date);
  return { start: istMidnight(days[0]), end: istMidnight(addDaysIst(days.at(-1)!, 1)) };
}

/** The date "back" and "next" go to. */
export function stepDate(view: CalendarView, date: IstDate, dir: 1 | -1): IstDate {
  if (view === "day") return addDaysIst(date, dir);
  if (view === "week" || view === "list") return addDaysIst(date, 7 * dir);
  const [y, m] = date.split("-").map(Number);
  return isoDate(new Date(Date.UTC(y, m - 1 + dir, 1)));
}

/** Minutes after midnight IST of a moment. */
function istMinutes(d: Date) {
  const day = toIstDate(d);
  return Math.round((d.getTime() - istMidnight(day).getTime()) / 60_000);
}

export type Placed<T> = {
  item: T;
  /** 1-based grid row and how many rows it spans (15 minutes each). */
  row: number;
  span: number;
  /** 1-based lane among overlapping meetings, and the lane count of its group. */
  lane: number;
  lanes: number;
  /** Starts before or ends after the grid hours. */
  clipped: boolean;
};

/**
 * Places one day's meetings on the time grid: rows from their times, and side-by-side lanes
 * (up to 4) when they overlap.
 */
export function placeDay<T extends { startsAt: Date; endsAt: Date }>(
  day: IstDate,
  items: T[],
): Placed<T>[] {
  const startMin = GRID_START_HOUR * 60;
  const endMin = GRID_END_HOUR * 60;
  const dayStart = istMidnight(day).getTime();
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const placed: Placed<T>[] = sorted.map((item) => {
    const s = item.startsAt.getTime() < dayStart ? 0 : istMinutes(item.startsAt);
    const e = item.endsAt.getTime() >= dayStart + 24 * 3600_000 ? 24 * 60 : istMinutes(item.endsAt);
    const from = Math.min(Math.max(s, startMin), endMin - 15);
    const to = Math.max(Math.min(e, endMin), from + 15);
    return {
      item,
      row: Math.floor((from - startMin) / 15) + 1,
      span: Math.max(1, Math.ceil((to - from) / 15)),
      lane: 1,
      lanes: 1,
      clipped: s < startMin || e > endMin,
    };
  });
  // Groups of overlapping meetings share lanes.
  let group: Placed<T>[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.min(4, Math.max(1, ...group.map((g) => g.lane)));
    for (const g of group) g.lanes = lanes;
    group = [];
  };
  for (const p of placed) {
    if (group.length && p.row >= groupEnd) close();
    const used = new Set(group.filter((g) => g.row + g.span > p.row).map((g) => g.lane));
    let lane = 1;
    while (used.has(lane) && lane < 4) lane++;
    p.lane = lane;
    group.push(p);
    groupEnd = Math.max(groupEnd, p.row + p.span);
  }
  if (group.length) close();
  return placed;
}

/** A stable colour (0–5) for each host, in the order given. */
export function colourIndex(hostIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  [...new Set(hostIds)].sort().forEach((id, i) => map.set(id, i % 6));
  return map;
}
