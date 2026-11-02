// F22 slot rules: ranges and steps, minimum notice, how far ahead, gaps, overlaps across meeting
// types, days off, the per-day limit, and IST day edges.
import { describe, expect, it } from "vitest";
import {
  availableSlots,
  checkRanges,
  DEFAULT_HOURS,
  isoWeekday,
  slotStep,
  type Busy,
  type SlotRules,
} from "./slots";
import { formatIst, fromIstLocal } from "./time";

// Monday 2 Nov 2026, 09:00 IST.
const NOW = fromIstLocal("2026-11-02T09:00")!;
const RULES: SlotRules = {
  durationMin: 30,
  bufferMin: 0,
  minNoticeHours: 0,
  maxDaysAhead: 0,
  maxPerDay: null,
};
const at = (local: string) => fromIstLocal(local)!;
const times = (slots: Date[]) => slots.map((s) => formatIst(s, "EEE HH:mm"));
const slots = (rules: Partial<SlotRules> = {}, busy: Busy[] = [], extra = {}) =>
  availableSlots({
    hours: DEFAULT_HOURS,
    daysOff: [],
    rules: { ...RULES, ...rules },
    busy,
    meetingTypeId: "demo",
    now: NOW,
    ...extra,
  });

describe("slots (F22)", () => {
  it("every 30 minutes inside the hours; the last one ends at closing time", () => {
    const s = times(slots());
    expect(s[0]).toBe("Mon 10:00");
    expect(s.at(-1)).toBe("Mon 17:30");
    expect(s).toHaveLength(16);
  });

  it("every 15 minutes for short meetings", () => {
    expect(slotStep(15)).toBe(15);
    expect(slotStep(20)).toBe(15);
    expect(slotStep(30)).toBe(30);
    const s = times(slots({ durationMin: 20 }));
    expect(s.slice(0, 3)).toEqual(["Mon 10:00", "Mon 10:15", "Mon 10:30"]);
    expect(s.at(-1)).toBe("Mon 17:30");
  });

  it("minimum notice hides slots that start too soon", () => {
    const s = times(slots({ minNoticeHours: 4 })); // 09:00 + 4h = 13:00
    expect(s[0]).toBe("Mon 13:00");
  });

  it("how far ahead counts IST days; weekends and days off have no slots", () => {
    const week = slots({ maxDaysAhead: 6 });
    const days = new Set(week.map((d) => formatIst(d, "EEE d")));
    expect([...days]).toEqual(["Mon 2", "Tue 3", "Wed 4", "Thu 5", "Fri 6"]);
    const off = slots({ maxDaysAhead: 1 }, [], { daysOff: ["2026-11-03"] });
    expect(new Set(off.map((d) => formatIst(d, "EEE")))).toEqual(new Set(["Mon"]));
  });

  it("a booking blocks its time, with both gaps, whatever its meeting type", () => {
    const busy: Busy[] = [
      {
        start: at("2026-11-02T11:00"),
        end: at("2026-11-02T11:30"),
        bufferMin: 15,
        meetingTypeId: "call",
      },
    ];
    const s = times(slots({ bufferMin: 15 }, busy));
    // 10:30 + 30 min + 15 min gap reaches 11:15, which overlaps; 11:30 is inside the other gap.
    expect(s).toContain("Mon 10:00");
    expect(s).not.toContain("Mon 10:30");
    expect(s).not.toContain("Mon 11:00");
    expect(s).not.toContain("Mon 11:30");
    expect(s).toContain("Mon 12:00");
  });

  it("the per-day limit counts only this meeting type", () => {
    const busy: Busy[] = [
      {
        start: at("2026-11-02T10:00"),
        end: at("2026-11-02T10:30"),
        bufferMin: 0,
        meetingTypeId: "demo",
      },
      {
        start: at("2026-11-03T10:00"),
        end: at("2026-11-03T10:30"),
        bufferMin: 0,
        meetingTypeId: "call",
      },
    ];
    const s = slots({ maxDaysAhead: 1, maxPerDay: 1 }, busy);
    expect(new Set(s.map((d) => formatIst(d, "EEE")))).toEqual(new Set(["Tue"]));
  });

  it("ranges with a break, and weekday numbers", () => {
    const hours = {
      ...DEFAULT_HOURS,
      "1": [
        { start: "10:00", end: "11:00" },
        { start: "14:00", end: "15:00" },
      ],
    };
    expect(times(slots({}, [], { hours }))).toEqual([
      "Mon 10:00",
      "Mon 10:30",
      "Mon 14:00",
      "Mon 14:30",
    ]);
    expect(isoWeekday("2026-11-02")).toBe(1);
    expect(isoWeekday("2026-11-08")).toBe(7);
  });

  it("checks a day's ranges", () => {
    expect(
      checkRanges([
        { start: "10:00", end: "13:00" },
        { start: "14:00", end: "18:00" },
      ]),
    ).toBeNull();
    expect(checkRanges([{ start: "10:00", end: "09:00" }])).toBe(
      "Each range must end after it starts.",
    );
    expect(
      checkRanges([
        { start: "10:00", end: "12:00" },
        { start: "11:00", end: "13:00" },
      ]),
    ).toBe("Ranges on the same day can't overlap.");
    expect(checkRanges([{ start: "9am", end: "12:00" }])).toBe("Use times like 09:30.");
  });
});
