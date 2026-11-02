// The calendar's month / week / day maths (F22 round 2).
import { describe, expect, it } from "vitest";
import { fromIstLocal } from "./time";
import { daysShown, parseView, placeDay, rangeOf, stepDate } from "./calendar-view";

describe("calendar views", () => {
  it("week runs Monday to Sunday; month covers whole weeks; day is one day", () => {
    expect(daysShown("week", "2026-11-04")).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    const month = daysShown("month", "2026-11-18");
    expect(month[0]).toBe("2026-10-26");
    expect(month.at(-1)).toBe("2026-12-06");
    expect(month.length % 7).toBe(0);
    expect(daysShown("day", "2026-11-18")).toEqual(["2026-11-18"]);
    const r = rangeOf("day", "2026-11-18");
    expect(r.start.toISOString()).toBe("2026-11-17T18:30:00.000Z");
    expect(r.end.getTime() - r.start.getTime()).toBe(24 * 3600_000);
  });

  it("back and next move by a day, a week or a month", () => {
    expect(stepDate("day", "2026-11-30", 1)).toBe("2026-12-01");
    expect(stepDate("week", "2026-11-04", -1)).toBe("2026-10-28");
    expect(stepDate("month", "2026-01-31", -1)).toBe("2025-12-01");
    expect(parseView("bogus")).toBe("week");
  });

  it("places meetings in 15-minute rows from 06:00, side by side when they overlap", () => {
    const m = (id: string, from: string, to: string) => ({
      id,
      startsAt: fromIstLocal(`2026-11-03T${from}`)!,
      endsAt: fromIstLocal(`2026-11-03T${to}`)!,
    });
    const placed = placeDay("2026-11-03", [
      m("a", "10:00", "10:30"),
      m("b", "10:15", "11:00"),
      m("c", "12:00", "12:30"),
      m("d", "05:00", "06:30"),
    ]);
    const by = Object.fromEntries(placed.map((p) => [p.item.id, p]));
    expect(by.a).toMatchObject({ row: 17, span: 2, lane: 1, lanes: 2 });
    expect(by.b).toMatchObject({ row: 18, span: 3, lane: 2, lanes: 2 });
    expect(by.c).toMatchObject({ row: 25, span: 2, lane: 1, lanes: 1 });
    expect(by.d).toMatchObject({ row: 1, span: 2, clipped: true });
  });
});

describe("Add hours", () => {
  it("adds the next range half an hour after the last, up to an hour long", async () => {
    const { nextRange } = await import("./slots");
    expect(nextRange({ start: "11:00", end: "11:30" })).toEqual({ start: "12:00", end: "12:30" });
    expect(nextRange({ start: "10:00", end: "18:00" })).toEqual({ start: "18:30", end: "19:30" });
    expect(nextRange({ start: "22:00", end: "23:00" })).toEqual({ start: "23:30", end: "23:59" });
    expect(nextRange({ start: "22:30", end: "23:40" })).toBeNull();
  });
});
