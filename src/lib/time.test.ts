import { describe, expect, it } from "vitest";
import {
  addDaysIst,
  formatIst,
  formatIstDate,
  isIstDate,
  istDateSpan,
  istDayRange,
  istMonthRange,
  istWeekRange,
  todayIst,
} from "./time";

describe("IST dates", () => {
  it("today follows India, not UTC", () => {
    // 20:00 UTC on 15 Oct is 01:30 IST on 16 Oct.
    expect(todayIst(new Date("2026-10-15T20:00:00Z"))).toBe("2026-10-16");
    // 18:00 UTC on 15 Oct is 23:30 IST, still 15 Oct.
    expect(todayIst(new Date("2026-10-15T18:00:00Z"))).toBe("2026-10-15");
  });

  it("adds days across months and years", () => {
    expect(addDaysIst("2026-10-16", 4)).toBe("2026-10-20");
    expect(addDaysIst("2026-10-30", 14)).toBe("2026-11-13");
    expect(addDaysIst("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIst("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats moments and dates in IST", () => {
    expect(formatIst(new Date("2026-10-16T09:00:00Z"))).toBe("16 Oct 2026, 2:30 pm");
    expect(formatIstDate("2026-10-16")).toBe("16 Oct 2026");
  });

  it("recognises real calendar dates only", () => {
    expect(isIstDate("2026-10-16")).toBe(true);
    expect(isIstDate("2028-02-29")).toBe(true);
    expect(isIstDate("2026-02-29")).toBe(false);
    expect(isIstDate("2026-13-01")).toBe(false);
    expect(isIstDate("16/10/2026")).toBe(false);
  });
});

describe("IST ranges", () => {
  it("a day runs from 00:00 IST (18:30 UTC the day before)", () => {
    const { start, end } = istDayRange("2026-10-16");
    expect(start.toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-16T18:30:00.000Z");
  });

  it("a span includes both end dates", () => {
    const { start, end } = istDateSpan("2026-10-01", "2026-10-31");
    expect(start.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });

  it("weeks run Monday to Sunday in IST", () => {
    // Friday 16 Oct 2026 → week of Monday 12 Oct.
    const week = istWeekRange(new Date("2026-10-16T06:00:00Z"));
    expect(week.start.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(week.end.toISOString()).toBe("2026-10-18T18:30:00.000Z");
    // 19:00 UTC Sunday 18 Oct is 00:30 IST Monday 19 Oct: a new week.
    expect(istWeekRange(new Date("2026-10-18T19:00:00Z")).start.toISOString()).toBe(
      "2026-10-18T18:30:00.000Z",
    );
  });

  it("months follow the IST calendar", () => {
    const month = istMonthRange(new Date("2026-10-31T20:00:00Z")); // 1 Nov, 01:30 IST
    expect(month.start.toISOString()).toBe("2026-10-31T18:30:00.000Z");
    expect(month.end.toISOString()).toBe("2026-11-30T18:30:00.000Z");
  });
});
