import { describe, expect, it } from "vitest";
import { tabOf } from "./today-sections";

describe("My tasks tabs (D-062)", () => {
  const task = (over: Partial<Parameters<typeof tabOf>[0]>) =>
    tabOf({ section: "due", kind: "step", detail: "", ...over });

  it("connection requests, withdrawals and people never contacted are new outreach", () => {
    expect(task({ channel: "LinkedIn connection request" })).toBe("new");
    expect(task({ kind: "withdraw" })).toBe("new");
    expect(task({ section: "stale", kind: "open", detail: "Nothing logged yet" })).toBe("new");
  });

  it("call steps, follow-ups that say call, and meetings are calls", () => {
    expect(task({ channel: "Call" })).toBe("calls");
    expect(
      task({ section: "followup", kind: "followup", nextAction: "Call about the pilot" }),
    ).toBe("calls");
    expect(task({ section: "meeting", kind: "quick" })).toBe("calls");
  });

  it("everything else is a follow-up; a late task keeps its tab", () => {
    expect(task({ channel: "LinkedIn message" })).toBe("followups");
    expect(task({ section: "reply", kind: "quick" })).toBe("followups");
    expect(task({ section: "backlog", origin: "due", channel: "Call" })).toBe("calls");
    expect(task({ section: "backlog", origin: "followup", kind: "followup" })).toBe("followups");
  });
});
