// Plain-words descriptions of plan steps (F17), shared by the plan pages, the builder and
// Today. No server imports.
import type { ChannelCondition, StepChannel } from "./db/enums";

type StepLike = {
  channels: { channel: StepChannel; when: ChannelCondition }[];
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
      return `${i > 0 ? "otherwise " : ""}${c.channel}${cond}`;
    })
    .join(" → ");
}

/** When a step falls due, in words. */
export function describeWait(steps: StepLike[], index: number): string {
  const w = steps[index].waitDays;
  const days = `${w} day${w === 1 ? "" : "s"}`;
  if (index === 0) return w === 0 ? "On the day they're enrolled" : `${days} after enrolling`;
  if (steps[index - 1].channels[0]?.channel === "LinkedIn connection request") {
    return `${days} after the connection is accepted`;
  }
  return `${days} after step ${index} is done`;
}
