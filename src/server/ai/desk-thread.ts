// The Outreach Desk thread (D-056): every activity on a person, their AI instructions and drafts,
// and the viewer's own earlier AI chats (F23), merged oldest first. Old rows are only mapped for
// display, never changed. Also the transcript the AI reads (spec section 7).
import { and, asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { DESK_CHANNELS, type DeskChannel, type DeskTask } from "@/lib/db/enums";
import { activity, aiChat, aiChatMessage, deskEntry, user, type DeskOption } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";

/** What the bubble says the channel was. */
export type ChannelLabel = DeskChannel | "LinkedIn connection request" | "In person";

type Base = { id: string; at: Date; who: string | null };
export type DeskItem =
  | (Base & {
      kind: "them";
      channel: ChannelLabel;
      text: string;
      replyType: string | null;
    })
  | (Base & {
      kind: "sent";
      channel: ChannelLabel;
      called: boolean;
      subject: string | null;
      text: string;
      approach: string | null;
    })
  | (Base & { kind: "info"; text: string })
  | (Base & { kind: "event"; label: string; text: string | null })
  | (Base & { kind: "ask"; text: string; source: "desk" | "chat" })
  | (Base & {
      kind: "draft";
      channel: DeskChannel | null;
      task: DeskTask | null;
      options: DeskOption[];
      tip: string | null;
      warning: string | null;
      templateId: string | null;
      source: "desk" | "chat";
      /** Options already marked as sent (their numbers). */
      sent: number[];
    });

export type ActivityRow = {
  id: string;
  at: Date;
  type: string;
  channel: string;
  deskChannel: string | null;
  direction: string | null;
  content: string | null;
  subject: string | null;
  replyType: string | null;
  requestNote: boolean;
  suggestionApproach: string | null;
  toStage: string | null;
  userName: string | null;
};

const OLD_CHANNEL_LABEL: Record<string, ChannelLabel> = {
  LinkedIn: "LinkedIn message",
  InMail: "LinkedIn InMail",
  Email: "Email",
  WhatsApp: "WhatsApp",
  Call: "Call",
  "In person": "In person",
};

/** The channel a bubble shows: the desk channel when saved, else from the old channel. */
export function channelLabel(row: Pick<ActivityRow, "channel" | "deskChannel">): ChannelLabel {
  if (row.deskChannel && (DESK_CHANNELS as readonly string[]).includes(row.deskChannel)) {
    return row.deskChannel as DeskChannel;
  }
  return OLD_CHANNEL_LABEL[row.channel] ?? "LinkedIn message";
}

/**
 * One activity as a thread entry (display only). Replies are theirs; messages, InMails, calls
 * and connection requests are the rep's; notes are notes; everything else is an event line.
 */
export function activityItem(r: ActivityRow): DeskItem {
  const base = { id: r.id, at: r.at, who: r.userName };
  const text = r.content ?? "";
  if (r.type === "Reply received" || r.direction === "in") {
    return { ...base, kind: "them", channel: channelLabel(r), text, replyType: r.replyType };
  }
  if (r.type === "Message sent" || r.type === "InMail sent" || r.type === "Call") {
    return {
      ...base,
      kind: "sent",
      channel: r.type === "Call" ? "Call" : channelLabel(r),
      called: r.type === "Call",
      subject: r.subject,
      text,
      approach: r.suggestionApproach,
    };
  }
  if (r.type === "Request sent") {
    return {
      ...base,
      kind: "sent",
      channel: r.requestNote ? "LinkedIn connection note" : "LinkedIn connection request",
      called: false,
      subject: null,
      text: text || (r.requestNote ? "Connection request with a note" : "Connection request"),
      approach: r.suggestionApproach,
    };
  }
  if (r.type === "Meeting note") {
    if (r.direction === "out") {
      return {
        ...base,
        kind: "sent",
        channel: "In person",
        called: false,
        subject: null,
        text,
        approach: null,
      };
    }
    return { ...base, kind: "info", text };
  }
  return { ...base, kind: "event", label: r.type, text: r.content };
}

/** Everything on the person's Desk thread, oldest first. Chats show only to their author. */
export async function deskThread(
  db: DbOrTx,
  viewer: Pick<Actor, "id">,
  personId: string,
): Promise<DeskItem[]> {
  const rows = await db
    .select({
      id: activity.id,
      at: activity.occurredAt,
      createdAt: activity.createdAt,
      type: activity.type,
      channel: activity.channel,
      deskChannel: activity.deskChannel,
      direction: activity.direction,
      content: activity.content,
      subject: activity.subject,
      replyType: activity.replyType,
      requestNote: activity.requestNote,
      suggestionApproach: activity.suggestionApproach,
      toStage: activity.toStage,
      fromDraftId: activity.fromDraftId,
      optionIndex: activity.optionIndex,
      userName: user.name,
    })
    .from(activity)
    .leftJoin(user, eq(user.id, activity.userId))
    .where(eq(activity.personId, personId))
    .orderBy(asc(activity.occurredAt), asc(activity.createdAt));
  const entries = await db
    .select({ e: deskEntry, userName: user.name })
    .from(deskEntry)
    .leftJoin(user, eq(user.id, deskEntry.userId))
    .where(eq(deskEntry.personId, personId))
    .orderBy(asc(deskEntry.createdAt));
  const chats = await db
    .select({ m: aiChatMessage, userName: user.name })
    .from(aiChatMessage)
    .innerJoin(aiChat, eq(aiChat.id, aiChatMessage.chatId))
    .leftJoin(user, eq(user.id, aiChat.userId))
    .where(and(eq(aiChat.personId, personId), eq(aiChat.userId, viewer.id)))
    .orderBy(asc(aiChatMessage.createdAt));

  const sentFrom = new Map<string, number[]>();
  for (const r of rows) {
    if (r.fromDraftId && r.optionIndex !== null) {
      sentFrom.set(r.fromDraftId, [...(sentFrom.get(r.fromDraftId) ?? []), r.optionIndex]);
    }
  }
  const items: (DeskItem & { order: number })[] = [];
  let order = 0;
  for (const r of rows) items.push({ ...activityItem(r), order: order++ });
  for (const { e, userName } of entries) {
    const base = { id: e.id, at: e.createdAt, who: userName, order: order++ };
    if (e.kind === "ask") {
      items.push({ ...base, kind: "ask", text: e.content ?? "", source: "desk" });
    } else {
      items.push({
        ...base,
        kind: "draft",
        channel: e.channel,
        task: e.task,
        options: e.options ?? [],
        tip: e.tip,
        warning: e.warning,
        templateId: e.templateId,
        source: "desk",
        sent: sentFrom.get(e.id) ?? [],
      });
    }
  }
  for (const { m, userName } of chats) {
    const base = { id: m.id, at: m.createdAt, who: userName, order: order++ };
    if (m.role === "rep") {
      items.push({ ...base, kind: "ask", text: m.content, source: "chat" });
    } else {
      items.push({
        ...base,
        kind: "draft",
        channel: null,
        task: null,
        options: m.drafts.map((d) => ({ label: d.approach, subject: "", text: d.text })),
        tip: m.content,
        warning: m.flags.length ? m.flags.join(" ") : null,
        templateId: null,
        source: "chat",
        sent: [],
      });
    }
  }
  return items
    .sort((a, b) => a.at.getTime() - b.at.getTime() || a.order - b.order)
    .map(({ order: _o, ...item }) => item as DeskItem);
}

const firstName = (name: string | null | undefined, fallback: string) =>
  name?.trim().split(/\s+/)[0] || fallback;

/** How many entries the AI reads (spec section 5). */
export const TRANSCRIPT_ENTRIES = 40;

/** The conversation as the AI reads it (spec section 7): the last `limit` entries. */
export function transcript(items: DeskItem[], prospect: string, limit = TRANSCRIPT_ENTRIES) {
  const them = firstName(prospect, "They");
  return items
    .filter((i) => i.kind !== "event")
    .slice(-limit)
    .map((i) => {
      const rep = firstName(i.who, "The rep");
      switch (i.kind) {
        case "them":
          return `[${them} replied via ${i.channel}]\n${i.text}`;
        case "sent":
          return [
            i.called ? `[${rep} called using this talk track]` : `[${rep} sent via ${i.channel}]`,
            ...(i.subject ? [`Subject: ${i.subject}`] : []),
            i.text,
          ].join("\n");
        case "info":
          return `[Note from ${rep}]\n${i.text}`;
        case "ask":
          return `[${rep}'s instruction]\n${i.text}`;
        case "draft":
          return [
            `[Drafts offered via ${i.channel ?? "chat"}, not sent]`,
            ...i.options.map((o) => `- ${o.text}`),
          ].join("\n");
        default:
          return "";
      }
    })
    .join("\n\n");
}
