// Where a person starts on a plan (D-060): their history is read step by step, so someone who
// was already contacted starts at the step after what was already done. Pure, no database.
import type { ChannelOption } from "@/lib/db/schema";
import type { StepChannel } from "@/lib/db/enums";

/** One thing already logged on the person, oldest first. */
export type PastTouch = { type: string; channel: string | null; date: string };

type Kind = "request" | "message" | "call" | "task";

const KIND: Record<StepChannel, Kind> = {
  "LinkedIn connection request": "request",
  "LinkedIn message": "message",
  InMail: "message",
  Email: "message",
  WhatsApp: "message",
  Call: "call",
  "Manual task": "task",
  Custom: "task",
};

function kindOf(t: PastTouch): Kind | "accepted" | "reply" | null {
  if (t.type === "Request sent") return "request";
  if (t.type === "Request accepted") return "accepted";
  if (t.type === "Message sent" || t.type === "InMail sent") return "message";
  if (t.type === "Call") return "call";
  if (t.type === "Task done") return "task";
  if (t.type === "Reply received") return "reply";
  return null;
}

export type Placement = {
  /** Steps already done from the history (0 = none). */
  done: number;
  /** The date the last of them was done. */
  lastDoneDate: string | null;
  /** The last step done was a connection request nobody has accepted yet. */
  waitingForAcceptance: boolean;
  requestSentDate: string | null;
  acceptedDate: string | null;
  /** When the first touch that wasn't a connection request happened. */
  firstTouchDate: string | null;
};

/**
 * Matches the history to the steps in order. A step is done by the first matching touch after
 * the previous step's: a connection request by a request sent or accepted; a message step by
 * any message sent (LinkedIn, InMail, email or WhatsApp); a call by a call; a task by a task
 * done. A step with several options is done by any of them. The first step with no matching
 * touch is where they start. A connection request already accepted, or a LinkedIn message that
 * was sent without one (they were already connected), counts as done.
 */
export function placeInPlan(
  steps: { channels: ChannelOption[] }[],
  history: PastTouch[],
): Placement {
  const touches = history.map((t) => ({ ...t, kind: kindOf(t) }));
  let at = 0;
  let done = 0;
  let lastDoneDate: string | null = null;
  let requestSentDate: string | null = null;
  let firstTouchDate: string | null = null;
  let lastWasRequest = false;

  for (const step of steps) {
    const kinds = new Set(step.channels.map((c) => KIND[c.channel]));
    let hit = -1;
    for (let i = at; i < touches.length; i++) {
      const k = touches[i].kind;
      if (
        k &&
        k !== "reply" &&
        (kinds.has(k as Kind) || (k === "accepted" && kinds.has("request")))
      ) {
        hit = i;
        break;
      }
    }
    if (hit === -1 && kinds.has("request")) {
      // Already connected: a LinkedIn message went out with no request logged.
      const connected = touches.findIndex(
        (t, i) => i >= at && t.kind === "message" && t.channel === "LinkedIn",
      );
      if (connected !== -1) {
        done++;
        lastDoneDate = touches[connected].date;
        lastWasRequest = false;
        continue; // the message itself is left for the next step
      }
    }
    if (hit === -1) break;
    const t = touches[hit];
    done++;
    lastDoneDate = t.date;
    lastWasRequest = kinds.has("request") && (t.kind === "request" || t.kind === "accepted");
    if (lastWasRequest && t.kind === "request") requestSentDate = t.date;
    if (!lastWasRequest && !firstTouchDate) firstTouchDate = t.date;
    at = hit + 1;
  }

  // Accepted: a Request accepted after the request, or anything they or we said on LinkedIn since.
  let acceptedDate: string | null = null;
  if (lastWasRequest) {
    const since = touches.slice(at - 1);
    const sign = since.find(
      (t) =>
        t.kind === "accepted" ||
        (t.channel === "LinkedIn" && (t.kind === "reply" || t.kind === "message")),
    );
    acceptedDate = sign?.date ?? null;
  }
  return {
    done,
    lastDoneDate,
    waitingForAcceptance: lastWasRequest && acceptedDate === null,
    requestSentDate,
    acceptedDate,
    firstTouchDate,
  };
}
