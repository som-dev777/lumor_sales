import { describe, expect, it } from "vitest";
import type { ChannelOption } from "@/lib/db/schema";
import {
  bannedPhrase,
  checkPlan,
  checkTouch,
  type GuardSettings,
  type PlanStepInput,
} from "./guardrails";
import { SEED_PLANS } from "./seed";

const S: GuardSettings = {
  msgAfterAcceptMinDays: 1,
  msgAfterAcceptMaxDays: 3,
  minGapDays: 3,
  maxFollowUps: 4,
  weeklyTouchLimit: 2,
  outreachMaxDays: 30,
};
const ch = (channel: ChannelOption["channel"]): ChannelOption[] => [{ channel, when: "always" }];
const request = (script?: string): PlanStepInput => ({
  channels: ch("LinkedIn connection request"),
  waitDays: 0,
  script,
});
const msg = (waitDays: number, text?: string): PlanStepInput => ({
  channels: ch("LinkedIn message"),
  waitDays,
  text,
});
const email = (waitDays: number): PlanStepInput => ({ channels: ch("Email"), waitDays });
const blocks = (steps: PlanStepInput[], settings = S) =>
  checkPlan("Outreach", steps, settings)
    .filter((f) => f.level === "block")
    .map((f) => f.rule);
const seed = SEED_PLANS[0].steps.map((s) => ({
  channels: s.channels,
  waitDays: s.waitDays ?? 0,
  script: s.script,
}));

describe("plan builder (checkPlan)", () => {
  it("the seed Official Outreach plan passes every guardrail", () => {
    expect(checkPlan("Outreach", seed, S).filter((f) => f.level === "block")).toEqual([]);
  });

  it("rule 1: message 1–3 days after acceptance (edges 1 and 3 pass, 0 and 4 block)", () => {
    for (const ok of [1, 3]) expect(blocks([request(), msg(ok), email(4)])).not.toContain(1);
    for (const bad of [0, 4]) expect(blocks([request(), msg(bad), email(4)])).toContain(1);
  });

  it("rule 2: gaps of at least 3 days, each longer than the last", () => {
    expect(blocks([request(), msg(2), email(3), msg(4)])).not.toContain(2);
    expect(blocks([request(), msg(2), email(2), msg(4)])).toContain(2); // 2 < 3
    expect(blocks([request(), msg(2), email(4), msg(4)])).toContain(2); // not longer
    // Owner's check: Follow-up 1 at 3 days is fine alone, but not after a 4-day gap.
    const copy = seed.map((s) => ({ ...s }));
    copy[3].waitDays = 3;
    expect(blocks(copy)).toContain(2);
  });

  it("rule 3: the builder blocks a 5th follow-up after Message 1 (the 'sixth touch')", () => {
    // The seed has 3 follow-ups after Message 1 (D-033 merged the call into step 4).
    const fourth = [...seed, msg(14)];
    expect(blocks(fourth)).not.toContain(3);
    expect(blocks(fourth)).toContain(7); // but one more step makes the plan too long
    const fifth = [...seed, msg(14), msg(18)];
    const found = checkPlan("Outreach", fifth, S).find((f) => f.rule === 3);
    expect(found).toMatchObject({
      level: "block",
      message: "At most 4 follow-ups after Message 1. This plan has 5.",
    });
  });

  it("rule 4: no 3 touches in 7 days, assuming acceptance at once", () => {
    // A request with a note counts: request d0, message d1, follow-up d5 → 3 touches in 5 days.
    expect(blocks([request("Hi!"), msg(1), email(4)])).toContain(4);
    // Without a note the request doesn't count (D-033), so the same timing is fine.
    expect(blocks([request(), msg(1), email(4)])).not.toContain(4);
  });

  it("rule 7: an Outreach plan ends within 30 days of acceptance", () => {
    expect(blocks([request(), msg(2), email(4), msg(7), msg(10)])).not.toContain(7); // 23 days
    expect(blocks([request(), msg(3), email(5), msg(9), msg(14)])).toContain(7); // 31 days
  });

  it("rules 5 and 6 warn; rules 1–4 and 7 only apply to Outreach plans", () => {
    const steps = [msg(0), msg(1, "Just following up on this"), msg(1)];
    const outreach = checkPlan("Outreach", steps, S);
    expect(outreach.filter((f) => f.level === "warn").map((f) => f.rule)).toEqual([5, 6]);
    const trial = checkPlan("Trial", steps, S);
    expect(trial.filter((f) => f.level === "block")).toEqual([]);
    expect(bannedPhrase("Bumping this to the top")).toBe("Bumping this");
    expect(bannedPhrase("Here's an example")).toBeNull();
  });

  it("structure: a step needs a channel that always applies; a request only as step 1", () => {
    expect(checkPlan("Trial", [], S)[0].message).toBe("Add at least one step.");
    const onlyPhone = [
      { channels: [{ channel: "Call" as const, when: "phone" as const }], waitDays: 0 },
    ];
    expect(checkPlan("Trial", onlyPhone, S)[0].message).toMatch(/must apply always/);
    expect(blocks([msg(0), request()])).toContain(0);
  });
});

describe("single touches (checkTouch)", () => {
  const base = { today: "2026-10-20", doNotContact: false, nurtureUntil: null };
  const rules = (c: Parameters<typeof checkTouch>[0]) =>
    checkTouch(c, S).map((f) => `${f.rule}:${f.level}`);

  it("rule 8: Do not contact blocks everything; rule 7: no touches while in Nurture", () => {
    expect(rules({ ...base, doNotContact: true, touch: { kind: "message" }, history: [] })).toEqual(
      ["8:block"],
    );
    expect(
      rules({ ...base, nurtureUntil: "2026-12-01", touch: { kind: "message" }, history: [] }),
    ).toEqual(["7:block"]);
    expect(
      rules({ ...base, nurtureUntil: "2026-10-20", touch: { kind: "message" }, history: [] }),
    ).toEqual([]);
  });

  it("rule 1: warns on a message the same day the connection was accepted", () => {
    const history = [{ date: "2026-10-20", kind: "accepted" as const }];
    expect(rules({ ...base, touch: { kind: "message" }, history })).toEqual(["1:warn"]);
    expect(rules({ ...base, today: "2026-10-21", touch: { kind: "message" }, history })).toEqual(
      [],
    );
  });

  it("rule 2: at least 3 days since the last touch (3 passes, 2 warns), each gap longer", () => {
    const one = [{ date: "2026-10-17", kind: "message" as const }];
    expect(rules({ ...base, touch: { kind: "message" }, history: one })).toEqual([]);
    expect(
      rules({ ...base, today: "2026-10-19", touch: { kind: "message" }, history: one }),
    ).toEqual(["2:warn"]);
    const two = [
      { date: "2026-10-10", kind: "message" as const },
      { date: "2026-10-15", kind: "message" as const },
    ];
    expect(rules({ ...base, touch: { kind: "message" }, history: two })).toEqual(["2:warn"]); // 5 after 5
    expect(
      rules({ ...base, today: "2026-10-21", touch: { kind: "message" }, history: two }),
    ).toEqual([]);
  });

  it("rule 3: warns on a 5th follow-up after Message 1", () => {
    const history = ["2026-08-01", "2026-08-05", "2026-08-12", "2026-08-22", "2026-09-05"].map(
      (date) => ({
        date,
        kind: "message" as const,
      }),
    );
    expect(rules({ ...base, touch: { kind: "message" }, history })).toContain("3:warn");
    expect(
      rules({ ...base, touch: { kind: "message" }, history: history.slice(0, 4) }),
    ).not.toContain("3:warn");
  });

  it("rule 4: warns on a 3rd touch in 7 days; a note-less request and unanswered calls don't count", () => {
    const history = [
      { date: "2026-10-14", kind: "message" as const },
      { date: "2026-10-17", kind: "call" as const, connected: true },
    ];
    expect(rules({ ...base, touch: { kind: "message" }, history })).toContain("4:warn");
    const softer = [
      { date: "2026-10-14", kind: "request" as const, withNote: false },
      { date: "2026-10-17", kind: "call" as const, connected: false },
    ];
    expect(rules({ ...base, touch: { kind: "message" }, history: softer })).toEqual([]);
    expect(rules({ ...base, touch: { kind: "call", connected: false }, history })).toEqual([]);
  });

  it("after a reply, outreach rules start again (it's a conversation now)", () => {
    const history = [
      { date: "2026-10-18", kind: "message" as const },
      { date: "2026-10-19", kind: "reply" as const },
    ];
    expect(rules({ ...base, touch: { kind: "message" }, history })).toEqual([]);
  });
});
