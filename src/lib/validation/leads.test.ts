import { describe, expect, it } from "vitest";
import { quickLogSchema } from "./leads";

describe("quick-log input (F15)", () => {
  it("reply type, demo date and lost reason are required where used", () => {
    expect(quickLogSchema.safeParse({ action: "gotReply" }).success).toBe(false);
    expect(quickLogSchema.safeParse({ action: "gotReply", replyType: "Bored" }).success).toBe(
      false,
    );
    expect(quickLogSchema.safeParse({ action: "gotReply", replyType: "Interested" }).success).toBe(
      true,
    );
    expect(quickLogSchema.safeParse({ action: "meetingBooked", meetingDate: "" }).success).toBe(
      false,
    );
    expect(
      quickLogSchema.safeParse({ action: "meetingBooked", meetingDate: "2026-10-22" }).success,
    ).toBe(true);
    expect(quickLogSchema.safeParse({ action: "markLost" }).success).toBe(false);
    expect(quickLogSchema.safeParse({ action: "markLost", lostReason: "No budget" }).success).toBe(
      true,
    );
  });

  it("an empty template choice means none; unknown actions are refused", () => {
    expect(quickLogSchema.parse({ action: "messageSent", templateId: "" })).toEqual({
      action: "messageSent",
      templateId: null,
    });
    expect(quickLogSchema.safeParse({ action: "callLogged", outcome: "Maybe" }).success).toBe(
      false,
    );
    expect(quickLogSchema.safeParse({ action: "deleteEverything" }).success).toBe(false);
  });
});
