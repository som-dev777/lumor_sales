// The owner's booking email wording (D-043), word for word from docs/email-templates/. Pure
// builders: the callers send them. Times for the person who booked are in their own time zone;
// times for the rep are in IST.
import type { MailContent } from "./calendar-mail";

export type Mail = { subject: string; content: MailContent };

/** Where the meeting happens, for the emails. */
export type Where =
  | { kind: "meet"; link: string }
  | { kind: "link"; link: string }
  | { kind: "place"; text: string }
  /** A phone number or other note for an online meeting. */
  | { kind: "text"; text: string }
  | { kind: "tbc" }
  | null;

const fmt = (d: Date, tz: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(d);

/** "Tuesday 10 November". */
export const dateText = (d: Date, tz: string) =>
  fmt(d, tz, { weekday: "long", day: "numeric", month: "long" });
/** "3:00 pm". */
export const timeText = (d: Date, tz: string) =>
  fmt(d, tz, { hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?([ap])m$/i, " $1m");
/** "India Standard Time" (the person's own zone, in words). */
export const zoneText = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "long" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value ?? tz;

const IST = "Asia/Kolkata";
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
/** "a" or "an": by the first letter, or for a number by how it's said (an 8, an 11, an 80). */
function article(word: string) {
  if (/^\d+$/.test(word)) {
    const n = Number(word);
    return n === 8 || n === 11 || n === 18 || (n >= 80 && n < 90) ? "an" : "a";
  }
  return /^[aeiou]/i.test(word) ? "an" : "a";
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function whereLine(w: Where): string | null {
  if (!w) return null;
  if (w.kind === "meet") return `Google Meet: ${w.link}`;
  if (w.kind === "link") return w.link;
  if (w.kind === "place") return `In person: ${w.text}`;
  if (w.kind === "text") return w.text;
  return "In person (we’ll confirm the place)";
}

export type InviteeMail = {
  inviteeName: string;
  /** The event's name in emails ("Lumor demo"). */
  eventName: string;
  startsAt: Date;
  timeZone: string;
  durationMin: number;
  where: Where;
  hostName: string;
  /** "Co-founder, Lumor". */
  hostTitle: string | null;
  /** The event's note in emails. */
  note: string | null;
  /** The person's private link to reschedule or cancel (none for older bookings). */
  manageUrl: string | null;
};

/** Sent at once (docs/email-templates/booking.md). */
export function confirmationMail(m: InviteeMail): Mail {
  const date = dateText(m.startsAt, m.timeZone);
  const time = timeText(m.startsAt, m.timeZone);
  const where = whereLine(m.where);
  return {
    subject: `You’re booked: ${m.eventName} on ${date} at ${time}`,
    content: {
      intro: [
        `Hi ${first(m.inviteeName)},`,
        `Thanks for booking ${article(m.eventName)} ${m.eventName}. Here are the details:`,
      ],
      rows: [
        [
          "When",
          `${date}, ${time} (${zoneText(m.startsAt, m.timeZone)}), ${m.durationMin} minutes`,
        ],
        ...(where ? ([["Where", where]] as [string, string][]) : []),
        ["With", m.hostTitle ? `${m.hostName}, ${m.hostTitle}` : m.hostName],
      ],
      after: m.note ? [m.note] : [],
      button: m.manageUrl ? { label: "Reschedule or cancel", url: m.manageUrl } : undefined,
      signoff: ["See you then,", "", first(m.hostName), "Lumor"],
    },
  };
}

/** The link part of a reminder: " on Google Meet: …", " at the address", or nothing. */
function reminderWhere(w: Where): string {
  if (!w) return "";
  if (w.kind === "meet") return ` on Google Meet: ${w.link}`;
  if (w.kind === "link") return `: ${w.link}`;
  if (w.kind === "place") return ` at ${w.text}`;
  if (w.kind === "text") return ` (${w.text})`;
  return "";
}

/** 24 hours before. */
export function reminder24Mail(m: InviteeMail): Mail {
  const time = timeText(m.startsAt, m.timeZone);
  return {
    subject: `Tomorrow: your ${m.eventName} at ${time}`,
    content: {
      intro: [
        `Hi ${first(m.inviteeName)}, a quick reminder that we’re meeting tomorrow at ${time}${reminderWhere(m.where)}.${m.manageUrl ? " If the time no longer works, you can pick another slot." : ""}`,
      ],
      rows: [],
      button: m.manageUrl ? { label: "Choose a new time", url: m.manageUrl } : undefined,
      signoff: [first(m.hostName), "Lumor"],
    },
  };
}

/** 1 hour before. */
export function reminder1Mail(m: InviteeMail): Mail {
  const time = timeText(m.startsAt, m.timeZone);
  const w = m.where;
  const link =
    w?.kind === "meet" || w?.kind === "link"
      ? `: ${w.link}`
      : w?.kind === "place"
        ? `, at ${w.text}`
        : w?.kind === "text"
          ? ` (${w.text})`
          : "";
  return {
    subject: `Starting in an hour: ${m.eventName}`,
    content: {
      intro: [`Hi ${first(m.inviteeName)}, see you at ${time}${link}.`],
      rows: [],
      button: m.manageUrl ? { label: "Choose a new time", url: m.manageUrl } : undefined,
      foot: m.manageUrl ? "(if something’s come up)" : undefined,
      signoff: [first(m.hostName), "Lumor"],
    },
  };
}

export type RepMail = {
  name: string;
  company: string;
  eventName: string;
  startsAt: Date;
  durationMin: number;
  where: Where;
  answers: { question: string; answer: string }[];
  /** The person's page (absolute), or the meeting on the calendar. */
  openUrl: string;
};

/** "Research Head" from a booking question about their role or title. */
export function roleFrom(answers: { question: string; answer: string }[]): string | null {
  const a = answers.find((x) => /\b(role|title|designation|position|job)\b/i.test(x.question));
  return a?.answer.trim() || null;
}

const istDate = (d: Date) => dateText(d, IST);
const istTime = (d: Date) => timeText(d, IST);

/** To the rep when someone books (docs/email-templates/calendly.md, section 1). */
export function repBookedMail(m: RepMail & { created: boolean; planPaused: boolean }): Mail {
  const role = roleFrom(m.answers);
  const who = role ? `${m.name} (${role} at ${m.company})` : `${m.name} (${m.company})`;
  const w = m.where;
  const whereRow: [string, string][] =
    w?.kind === "meet" ? [["Google Meet", w.link]] : w ? [["Where", whereLine(w)!]] : [];
  return {
    subject: `${capital(m.eventName)} booked: ${m.name}, ${m.company} · ${istDate(m.startsAt)} at ${istTime(m.startsAt)} IST`,
    content: {
      intro: [
        `${who} booked ${article(`${m.durationMin}`)} ${m.durationMin}-minute ${m.eventName}.`,
      ],
      rows: [
        ["When", `${istDate(m.startsAt)}, ${istTime(m.startsAt)} IST`],
        ...whereRow,
        ...m.answers.map((a) => [a.question, a.answer || "Nothing added"] as [string, string]),
      ],
      after: [
        m.created
          ? "This person wasn’t in Sales Hub, so a new lead was created and assigned to you. Check the company and persona."
          : `Sales Hub has already logged “Meeting booked”, moved them to Meeting scheduled${m.planPaused ? ", and paused their outreach plan." : "."}`,
        "Before the call, review the conversation and pick your demo angle.",
      ],
      button: { label: "Open in Sales Hub", url: m.openUrl },
    },
  };
}

/** To the rep when it's cancelled (section 2). */
export function repCancelledMail(
  m: Pick<RepMail, "name" | "company" | "eventName" | "startsAt" | "openUrl"> & {
    reason: string | null;
    by: string;
    planResumed: boolean;
  },
): Mail {
  const by = m.by === m.name ? m.name : `${m.by}`;
  const withWhom = m.by === m.name ? "" : ` with ${m.name}`;
  return {
    subject: `${capital(m.eventName)} cancelled: ${m.name}, ${m.company}`,
    content: {
      intro: [
        `${by} cancelled the ${m.eventName}${withWhom} on ${istDate(m.startsAt)}. Reason: ${m.reason || "None given"}. ${m.planResumed ? "Their plan has resumed so you can follow up." : "Follow up when it suits."}`,
      ],
      rows: [],
      button: { label: "Open in Sales Hub", url: m.openUrl },
    },
  };
}

/** To the rep when it moves (section 3). */
export function repMovedMail(
  m: Pick<RepMail, "name" | "company" | "eventName" | "openUrl"> & {
    from: Date;
    to: Date;
    by: string;
  },
): Mail {
  const by = m.by === m.name ? m.name : m.by;
  const withWhom = m.by === m.name ? "" : ` with ${m.name}`;
  return {
    subject: `${capital(m.eventName)} moved: ${m.name}, ${m.company} · ${istDate(m.to)} at ${istTime(m.to)} IST`,
    content: {
      intro: [
        `${by} moved the ${m.eventName}${withWhom} from ${istDate(m.from)}, ${istTime(m.from)} IST to ${istDate(m.to)}, ${istTime(m.to)} IST.`,
      ],
      rows: [],
      button: { label: "Open in Sales Hub", url: m.openUrl },
    },
  };
}

/** To the person who booked when the meeting moves (same style as the confirmation). */
export function movedMail(m: InviteeMail, from: Date, by: string | null): Mail {
  const base = confirmationMail(m);
  const date = dateText(m.startsAt, m.timeZone);
  const time = timeText(m.startsAt, m.timeZone);
  return {
    subject: `Moved: your ${m.eventName} is now on ${date} at ${time}`,
    content: {
      ...base.content,
      intro: [
        `Hi ${first(m.inviteeName)},`,
        `Your ${m.eventName} has moved to a new time${by ? ` (changed by ${by})` : ""}. It was ${dateText(from, m.timeZone)} at ${timeText(from, m.timeZone)}. Here are the new details:`,
      ],
    },
  };
}

/** To the person who booked when the meeting is cancelled. */
export function cancelledMail(
  m: Pick<InviteeMail, "inviteeName" | "eventName" | "startsAt" | "timeZone" | "hostName">,
  o: { by: string | null; reason: string | null; bookAgainUrl: string | null },
): Mail {
  const date = dateText(m.startsAt, m.timeZone);
  const time = timeText(m.startsAt, m.timeZone);
  return {
    subject: `Cancelled: ${m.eventName} on ${date}`,
    content: {
      intro: [
        `Hi ${first(m.inviteeName)},`,
        `Your ${m.eventName} with ${m.hostName} on ${date} at ${time} is cancelled${o.by ? ` by ${o.by}` : ""}.${o.reason ? ` Reason: ${o.reason}` : ""}`,
      ],
      rows: [],
      button: o.bookAgainUrl ? { label: "Book another time", url: o.bookAgainUrl } : undefined,
      signoff: [first(m.hostName), "Lumor"],
    },
  };
}

/** A meeting the rep scheduled themselves (D-043): sent to its To list, CC copied. */
export function invitationMail(m: InviteeMail): Mail {
  const date = dateText(m.startsAt, m.timeZone);
  const time = timeText(m.startsAt, m.timeZone);
  const where = whereLine(m.where);
  return {
    subject: `Invitation: ${m.eventName} on ${date} at ${time}`,
    content: {
      intro: [`Hi,`, `${m.hostName} has invited you to ${m.eventName}.`],
      rows: [
        [
          "When",
          `${date}, ${time} (${zoneText(m.startsAt, m.timeZone)}), ${m.durationMin} minutes`,
        ],
        ...(where ? ([["Where", where]] as [string, string][]) : []),
        ["With", m.hostTitle ? `${m.hostName}, ${m.hostTitle}` : m.hostName],
      ],
      after: m.note ? [m.note] : [],
      button:
        m.where?.kind === "meet"
          ? { label: "Join with Google Meet", url: m.where.link }
          : undefined,
      signoff: ["See you then,", "", first(m.hostName), "Lumor"],
    },
  };
}
