// Plan scheduling (F17, D-031): pure date rules, no database. All dates are IST plain dates
// (YYYY-MM-DD). Waits are calendar days; with Skip weekends on, a Saturday or Sunday becomes
// the following Monday (D-033).
import type { ChannelOption } from "@/lib/db/schema";
import { addDaysIst } from "@/lib/time";

/** 0 = Sunday … 6 = Saturday, for an IST date. */
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function rollOffWeekend(date: string, skipWeekends = true): string {
  if (!skipWeekends) return date;
  const d = weekday(date);
  return d === 6 ? addDaysIst(date, 2) : d === 0 ? addDaysIst(date, 1) : date;
}

/** The date a step is due: the previous step's actual done date plus its wait. */
export function dueAfter(doneDate: string, waitDays: number, skipWeekends = true): string {
  return rollOffWeekend(addDaysIst(doneDate, waitDays), skipWeekends);
}

/** The next working day after a date (call retries, D-033). */
export function nextBusinessDay(date: string): string {
  return rollOffWeekend(addDaysIst(date, 1), true);
}

/** Days from a to b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/**
 * Guardrail 4 when scheduling: moves a touch later until it wouldn't be more than `limit`
 * touches in any 7 days (counting the touches already made), then off the weekend.
 */
export function fitWeeklyLimit(
  candidate: string,
  touchDates: string[],
  limit: number,
  skipWeekends = true,
): string {
  let date = rollOffWeekend(candidate, skipWeekends);
  for (let i = 0; i < 60; i++) {
    const inWindow = touchDates.filter((d) => {
      const gap = daysBetween(d, date);
      return gap >= 0 && gap < 7;
    }).length;
    if (inWindow < limit) return date;
    date = rollOffWeekend(addDaysIst(date, 1), skipWeekends);
  }
  return date;
}

/** The plan's time limit (guardrail 7), counted from acceptance or the first touch (D-033). */
export function endsByFrom(start: string, days: number): string {
  return addDaysIst(start, days);
}

/** Vice President and CXO contacts get the longer limit (D-033 F6). */
export function isSenior(seniority: string | null | undefined): boolean {
  return seniority === "Vice President" || seniority === "CXO";
}

/** The first channel option that applies to this person (D-033: ordered options). */
export function resolveChannel(
  options: ChannelOption[],
  person: { phone: string | null; email: string | null },
): ChannelOption["channel"] {
  for (const o of options) {
    if (o.when === "always") return o.channel;
    if (o.when === "phone" && person.phone) return o.channel;
    if (o.when === "email" && person.email) return o.channel;
  }
  return options[options.length - 1].channel;
}

/** Moves a date later by the days a plan was paused (pausing doesn't use up the limit). */
export function extendBy(date: string | null, pausedDays: number): string | null {
  return date ? addDaysIst(date, Math.max(0, pausedDays)) : null;
}
