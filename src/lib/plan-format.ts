// Plain-words descriptions of plan steps (F17), shared by the plan pages, the builder and
// Today. No server imports.
import type { ChannelCondition, StepChannel } from "./db/enums";

type StepLike = {
  channels: { channel: StepChannel; when: ChannelCondition; label?: string }[];
  waitDays: number;
  templatePurpose?: string | null;
  script?: string | null;
};

export const WHEN_LABEL: Record<ChannelCondition, string> = {
  always: "Always",
  phone: "If a phone is known",
  email: "If an email is known",
};

/** "Call if a phone is known → otherwise Email if an email is known → otherwise LinkedIn message". */
export function describeChannels(step: StepLike): string {
  return step.channels
    .map((c, i) => {
      const cond =
        c.when === "phone"
          ? " if a phone is known"
          : c.when === "email"
            ? " if an email is known"
            : "";
      // A Custom task shows its own name (D-043).
      const task = c.channel === "Custom" ? (c.label ?? "Custom task") : c.channel;
      return `${i > 0 ? "otherwise " : ""}${task}${cond}`;
    })
    .join(" → ");
}

/**
 * When a step falls due and what its follow-up does, in words (D-060): each step's days are
 * the follow-up after it, so step 1 is due the day someone is put on the plan.
 */
export function describeWait(steps: StepLike[], index: number): string {
  const w = steps[index].waitDays;
  const days = w === 0 ? "the same day" : `${w} day${w === 1 ? "" : "s"} later`;
  const first = index === 0 ? "Due the day they're put on the plan. " : "";
  if (index === steps.length - 1) {
    return `${first}${w === 0 ? "The plan finishes when this step is done." : `The plan finishes ${w} day${w === 1 ? "" : "s"} after this step.`}`;
  }
  if (steps[index].channels[0]?.channel === "LinkedIn connection request") {
    return `${first}Step ${index + 2} follows ${w === 0 ? "the day they accept" : `${w} day${w === 1 ? "" : "s"} after they accept`}.`;
  }
  return `${first}Step ${index + 2} follows ${days}.`;
}
