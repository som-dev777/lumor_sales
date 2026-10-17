// Cadence guardrails (F17, D-030): one module for the plan builder (checkPlan) and for single
// touches logged by hand or from Today (checkTouch), so the two can never disagree. Pure
// functions, no database. A "block" refuses; a "warn" lets the rep log anyway (audited).
import type { PlanType } from "@/lib/db/enums";
import type { ChannelOption } from "@/lib/db/schema";

export type GuardSettings = {
  msgAfterAcceptMinDays: number;
  msgAfterAcceptMaxDays: number;
  minGapDays: number;
  maxFollowUps: number;
  weeklyTouchLimit: number;
  outreachMaxDays: number;
};

export type Finding = { rule: number; level: "block" | "warn"; message: string; step?: number };

// --- Guardrail 6: every follow-up adds something new ----------------------------------------

const BANNED = /just following up|bumping this/i;

/** The banned phrase found in a text (guardrail 6), or null. */
export function bannedPhrase(text: string | null | undefined): string | null {
  const m = text?.match(BANNED);
  return m ? m[0] : null;
}

// --- The plan builder ------------------------------------------------------------------------

export type PlanStepInput = {
  channels: ChannelOption[];
  waitDays: number;
  /** The template or script text, for guardrail 6. */
  text?: string | null;
  /** Note sent with a connection request (it then counts as a touch). */
  script?: string | null;
};

const isRequest = (s: PlanStepInput) => s.channels[0]?.channel === "LinkedIn connection request";
const isManual = (s: PlanStepInput) => s.channels.every((c) => c.channel === "Manual task");
/** A touch reaches the person: not a manual task, and not a connection request without a note. */
const isTouch = (s: PlanStepInput) => !isManual(s) && !(isRequest(s) && !s.script?.trim());

/** Steps that make sense at all, for any plan type. */
function checkStructure(steps: PlanStepInput[]): Finding[] {
  const f: Finding[] = [];
  if (steps.length === 0) f.push({ rule: 0, level: "block", message: "Add at least one step." });
  steps.forEach((s, i) => {
    const step = i + 1;
    if (s.channels.length === 0) {
      f.push({ rule: 0, level: "block", step, message: `Step ${step}: choose a channel.` });
      return;
    }
    if (s.channels[s.channels.length - 1].when !== "always") {
      f.push({
        rule: 0,
        level: "block",
        step,
        message: `Step ${step}: the last channel option must apply always, so the step can always run.`,
      });
    }
    if (s.channels.some((c) => c.channel === "LinkedIn connection request")) {
      if (s.channels.length > 1 || i > 0) {
        f.push({
          rule: 0,
          level: "block",
          step,
          message: `Step ${step}: a connection request can only be the first step, on its own.`,
        });
      }
    }
    if (!Number.isInteger(s.waitDays) || s.waitDays < 0 || s.waitDays > 90) {
      f.push({
        rule: 0,
        level: "block",
        step,
        message: `Step ${step}: the wait must be 0–90 days.`,
      });
    }
  });
  return f;
}

export function checkPlan(
  planType: PlanType,
  steps: PlanStepInput[],
  settings: GuardSettings,
): Finding[] {
  const findings = checkStructure(steps);
  if (findings.some((f) => f.level === "block")) return findings;

  // Guardrails 5 and 6 apply to every plan type.
  const touchIdx = steps.map((s, i) => (isTouch(s) ? i : -1)).filter((i) => i >= 0);
  const startsWithRequest = isRequest(steps[0]);
  const firstMessage = touchIdx.find((i) => !isRequest(steps[i]));
  const followUps = firstMessage === undefined ? [] : touchIdx.filter((i) => i > firstMessage);

  for (let k = 1; k < followUps.length; k++) {
    const a = steps[followUps[k - 1]].channels[0].channel;
    const b = steps[followUps[k]].channels[0].channel;
    if (a === b) {
      findings.push({
        rule: 5,
        level: "warn",
        step: followUps[k] + 1,
        message: `Step ${followUps[k] + 1}: two follow-ups in a row by ${a}. Change channel where you can (email or a call).`,
      });
    }
  }
  steps.forEach((s, i) => {
    const phrase = bannedPhrase(s.text) ?? bannedPhrase(s.script);
    if (phrase) {
      findings.push({
        rule: 6,
        level: "warn",
        step: i + 1,
        message: `Step ${i + 1} says "${phrase}". Every follow-up should add something new: a resource, a question or an example.`,
      });
    }
  });

  // Guardrails 1–4 and 7 are about people who haven't replied: Outreach plans only (D-034).
  if (planType !== "Outreach") return findings;
  const block = (rule: number, message: string, step?: number) =>
    findings.push({ rule, level: "block", message, step });

  // 1: message 1–3 days after the connection is accepted.
  if (startsWithRequest && steps.length > 1) {
    const w = steps[1].waitDays;
    if (w < settings.msgAfterAcceptMinDays || w > settings.msgAfterAcceptMaxDays) {
      block(
        1,
        `Step 2: message ${settings.msgAfterAcceptMinDays}–${settings.msgAfterAcceptMaxDays} days after the connection is accepted, not ${w}.`,
        2,
      );
    }
  }

  // 3: at most N follow-ups after Message 1, across all channels.
  if (followUps.length > settings.maxFollowUps) {
    block(
      3,
      `At most ${settings.maxFollowUps} follow-ups after Message 1. This plan has ${followUps.length}.`,
      followUps[settings.maxFollowUps] + 1,
    );
  }

  // 2: gaps between follow-up touches of at least N days, each longer than the last.
  const gapTo = (from: number, to: number) =>
    steps.slice(from + 1, to + 1).reduce((sum, s) => sum + s.waitDays, 0);
  const chain = firstMessage === undefined ? [] : [firstMessage, ...followUps];
  let previous = -1;
  for (let k = 1; k < chain.length; k++) {
    const gap = gapTo(chain[k - 1], chain[k]);
    const step = chain[k] + 1;
    if (gap < settings.minGapDays) {
      block(
        2,
        `Step ${step}: at least ${settings.minGapDays} days between touches (it's ${gap}).`,
        step,
      );
    } else if (gap <= previous) {
      block(
        2,
        `Step ${step}: each gap must be longer than the last (${gap} days after a ${previous}-day gap).`,
        step,
      );
    }
    previous = gap;
  }

  // 4: at most N touches in any 7 days, assuming the connection is accepted at once.
  const day: number[] = [];
  let at = 0;
  for (const s of steps) {
    at += s.waitDays;
    if (isTouch(s)) day.push(at);
  }
  const n = settings.weeklyTouchLimit;
  for (let i = 0; i + n < day.length; i++) {
    if (day[i + n] - day[i] < 7) {
      block(
        4,
        `At most ${n} touches in any 7 days. Touches ${i + 1}–${i + n + 1} would fall within ${day[i + n] - day[i]} days.`,
      );
      break;
    }
  }

  // 7: the plan must fit in its time limit, counted from acceptance (or the first touch).
  const from = startsWithRequest ? 1 : (touchIdx[0] ?? 0) + 1;
  const length = steps.slice(from).reduce((sum, s) => sum + s.waitDays, 0);
  if (length > settings.outreachMaxDays) {
    block(
      7,
      `An Outreach plan must end within ${settings.outreachMaxDays} days of acceptance. This one takes ${length}.`,
    );
  }
  return findings;
}

// --- Single touches (manual logging, Today's Done, Snooze) ----------------------------------

export type TouchKind = "request" | "message" | "call";

export type HistoryItem = {
  /** IST date. */
  date: string;
  kind: "request" | "message" | "call" | "reply" | "accepted";
  /** A connection request sent with a note. */
  withNote?: boolean;
  /** A call that connected (other calls aren't touches, D-034). */
  connected?: boolean;
};

export type TouchCheck = {
  today: string;
  touch: { kind: TouchKind; withNote?: boolean; connected?: boolean };
  history: HistoryItem[];
  doNotContact: boolean;
  nurtureUntil: string | null;
};

const counts = (h: { kind: string; withNote?: boolean; connected?: boolean }) =>
  (h.kind === "request" && h.withNote) ||
  h.kind === "message" ||
  (h.kind === "call" && h.connected);

const diff = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );

export function checkTouch(c: TouchCheck, settings: GuardSettings): Finding[] {
  const f: Finding[] = [];
  // 8: Do not contact overrides everything.
  if (c.doNotContact) {
    return [{ rule: 8, level: "block", message: "This person is marked Do not contact." }];
  }
  // 7: no touches while in Nurture.
  if (c.nurtureUntil && c.nurtureUntil > c.today) {
    return [
      {
        rule: 7,
        level: "block",
        message: `This person is in Nurture until ${c.nurtureUntil}: no touches until then.`,
      },
    ];
  }
  if (!counts(c.touch)) return f;

  const sorted = [...c.history].sort((a, b) => a.date.localeCompare(b.date));
  const lastReply = sorted.map((h) => h.kind).lastIndexOf("reply");
  const since = sorted.slice(lastReply + 1); // guardrails 1–4 are about people who haven't replied
  const touches = since.filter(counts);
  const messages = touches.filter((h) => h.kind !== "request");

  // 1: not the same day the connection was accepted.
  const accepted = [...since].reverse().find((h) => h.kind === "accepted");
  if (c.touch.kind === "message" && accepted?.date === c.today && messages.length === 0) {
    f.push({
      rule: 1,
      level: "warn",
      message: `Wait ${settings.msgAfterAcceptMinDays}–${settings.msgAfterAcceptMaxDays} days after the connection is accepted before messaging.`,
    });
  }

  // 2: gaps of at least N days, each longer than the last (the first message is guardrail 1's).
  if (messages.length > 0) {
    const last = messages[messages.length - 1].date;
    const gap = diff(last, c.today);
    if (gap < settings.minGapDays) {
      f.push({
        rule: 2,
        level: "warn",
        message: `Only ${gap} day${gap === 1 ? "" : "s"} since the last touch. Leave at least ${settings.minGapDays}.`,
      });
    } else if (messages.length > 1) {
      const previous = diff(messages[messages.length - 2].date, last);
      if (gap <= previous) {
        f.push({
          rule: 2,
          level: "warn",
          message: `Each gap should be longer than the last (${gap} days after a ${previous}-day gap).`,
        });
      }
    }
  }

  // 3: at most N follow-ups after Message 1.
  const followUpsSoFar = Math.max(0, messages.length - 1);
  if (messages.length > 0 && followUpsSoFar >= settings.maxFollowUps) {
    f.push({
      rule: 3,
      level: "warn",
      message: `This would be follow-up ${followUpsSoFar + 1} after Message 1. The limit is ${settings.maxFollowUps}.`,
    });
  }

  // 4: at most N touches in any 7 days.
  const recent = touches.filter((h) => {
    const d = diff(h.date, c.today);
    return d >= 0 && d < 7;
  }).length;
  if (recent >= settings.weeklyTouchLimit) {
    f.push({
      rule: 4,
      level: "warn",
      message: `${recent} touches in the last 7 days already. The limit is ${settings.weeklyTouchLimit}.`,
    });
  }
  return f;
}
