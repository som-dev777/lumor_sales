import { describe, expect, it } from "vitest";
import { isoWeekday, nextRunAt, presetSpan, scheduleSpan, spanLabel } from "./report-periods";

describe("report periods (F19, IST, calendar quarters)", () => {
  const today = "2026-10-30"; // a Friday

  it("covers today, the week, month, quarter, half-year and year", () => {
    expect(presetSpan("today", today)).toEqual({ from: today, to: today });
    expect(presetSpan("week", today)).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(presetSpan("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetSpan("quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetSpan("half", today)).toEqual({ from: "2026-07-01", to: "2026-12-31" });
    expect(presetSpan("year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetSpan("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("a custom range needs From on or before To", () => {
    expect(presetSpan("custom", today, { from: "2026-10-01", to: "2026-10-15" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
    });
    expect(() => presetSpan("custom", today, { from: "2026-10-15", to: "2026-10-01" })).toThrow();
    expect(() => presetSpan("custom", today, { from: "x", to: "2026-10-01" })).toThrow();
  });

  it("labels ranges for people", () => {
    expect(spanLabel({ from: "2026-10-01", to: "2026-12-31" })).toBe("1 Oct – 31 Dec 2026");
    expect(spanLabel({ from: "2025-12-29", to: "2026-01-04" })).toBe("29 Dec 2025 – 4 Jan 2026");
    expect(spanLabel({ from: today, to: today })).toBe("30 Oct 2026");
  });
});

describe("scheduled runs (D-039)", () => {
  it("daily covers that day; the others cover the previous full period", () => {
    expect(scheduleSpan("Daily", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-02" });
    expect(scheduleSpan("Weekly", "2026-11-02")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(scheduleSpan("Monthly", "2026-11-01")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(scheduleSpan("Quarterly", "2027-01-01")).toEqual({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(scheduleSpan("Half-yearly", "2026-07-01")).toEqual({
      from: "2026-01-01",
      to: "2026-06-30",
    });
    expect(scheduleSpan("Yearly", "2027-01-01")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("finds the next run in IST for each frequency", () => {
    const after = new Date("2026-10-30T13:00:00Z"); // Fri 30 Oct, 18:30 IST
    const iso = (s: Parameters<typeof nextRunAt>[0]) => nextRunAt(s, after).toISOString();
    // 19:00 IST today is still ahead.
    expect(iso({ frequency: "Daily", timeOfDay: "19:00", day: null })).toBe(
      "2026-10-30T13:30:00.000Z",
    );
    expect(iso({ frequency: "Daily", timeOfDay: "09:00", day: null })).toBe(
      "2026-10-31T03:30:00.000Z",
    );
    expect(iso({ frequency: "Weekly", timeOfDay: "09:00", day: 1 })).toBe(
      "2026-11-02T03:30:00.000Z",
    );
    expect(iso({ frequency: "Monthly", timeOfDay: "09:00", day: 1 })).toBe(
      "2026-11-01T03:30:00.000Z",
    );
    expect(iso({ frequency: "Quarterly", timeOfDay: "09:00", day: 1 })).toBe(
      "2027-01-01T03:30:00.000Z",
    );
    expect(iso({ frequency: "Half-yearly", timeOfDay: "09:00", day: 1 })).toBe(
      "2027-01-01T03:30:00.000Z",
    );
    expect(iso({ frequency: "Yearly", timeOfDay: "09:00", day: 15 })).toBe(
      "2027-01-15T03:30:00.000Z",
    );
    expect(isoWeekday("2026-11-01")).toBe(7);
  });
});
