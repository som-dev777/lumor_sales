import { describe, expect, it } from "vitest";
import { addDaysIst } from "@/lib/time";
import {
  dueAfter,
  endsByFrom,
  extendBy,
  fitWeeklyLimit,
  isSenior,
  nextBusinessDay,
  resolveChannel,
  rollOffWeekend,
  weekday,
} from "./schedule";
import { SEED_PLANS } from "./seed";

describe("plan scheduling (F17, D-031)", () => {
  it("weekends move to Monday; Friday + 2 is Monday", () => {
    expect(weekday("2026-10-16")).toBe(5); // Friday
    expect(dueAfter("2026-10-16", 2)).toBe("2026-10-19");
    expect(dueAfter("2026-10-16", 2, false)).toBe("2026-10-18");
    expect(rollOffWeekend("2026-10-17")).toBe("2026-10-19");
    expect(rollOffWeekend("2026-10-20")).toBe("2026-10-20");
  });

  it("a late step shifts everything after it (each counts from the actual done date)", () => {
    // Message 1 due Tue 20 Oct but done Fri 23 Oct (3 days late): Follow-up 1 = 23 + 4 = Tue 27.
    expect(dueAfter("2026-10-20", 4)).toBe("2026-10-26");
    expect(dueAfter("2026-10-23", 4)).toBe("2026-10-27");
  });

  it("calls with no answer retry the next business day", () => {
    expect(nextBusinessDay("2026-10-15")).toBe("2026-10-16");
    expect(nextBusinessDay("2026-10-16")).toBe("2026-10-19");
  });

  it("guardrail 4 when scheduling: a 3rd touch in 7 days moves later", () => {
    expect(fitWeeklyLimit("2026-10-22", ["2026-10-16", "2026-10-20"], 2)).toBe("2026-10-23");
    expect(fitWeeklyLimit("2026-10-22", ["2026-10-20"], 2)).toBe("2026-10-22");
  });

  it("pausing moves the time limit later; seniority picks 30 or 45 days", () => {
    expect(extendBy("2026-11-30", 5)).toBe("2026-12-05");
    expect(endsByFrom("2026-11-01", isSenior("CXO") ? 45 : 30)).toBe("2026-12-16");
    expect(isSenior("Vice President")).toBe(true);
    expect(isSenior(null)).toBe(false);
    expect(isSenior("Director")).toBe(false);
  });

  it("step 4 of the seed plan picks Call, then Email, then LinkedIn", () => {
    const options = SEED_PLANS[0].steps[3].channels;
    expect(resolveChannel(options, { phone: "+91 98", email: "a@b.co" })).toBe("Call");
    expect(resolveChannel(options, { phone: null, email: "a@b.co" })).toBe("Email");
    expect(resolveChannel(options, { phone: null, email: null })).toBe("LinkedIn message");
  });

  it("owner's check: accepted on day 13, the seed plan still reaches Break-up before ends_by", () => {
    const waits = SEED_PLANS[0].steps.map((s) => s.waitDays ?? 0);
    // Try every weekday for the enrolment date, to cover weekend shifts.
    for (let offset = 0; offset < 7; offset++) {
      const enrolled = addDaysIst("2026-10-19", offset);
      const accepted = addDaysIst(enrolled, 13);
      const endsBy = endsByFrom(accepted, 30);
      let done = accepted;
      const touches: string[] = [];
      for (const wait of waits.slice(1)) {
        done = fitWeeklyLimit(dueAfter(done, wait), touches, 2);
        touches.push(done);
      }
      expect(done <= endsBy, `enrolled ${enrolled}: Break-up ${done}, ends ${endsBy}`).toBe(true);
    }
  });
});
