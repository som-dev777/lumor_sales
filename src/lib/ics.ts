// Calendar invites (F22): a standard .ics file that Google Calendar, Outlook and Apple Calendar
// all read, and a Google Calendar "add event" link.

export type CalendarEvent = {
  /** Stays the same for the booking, so a cancellation removes the right event. */
  uid: string;
  start: Date;
  end: Date;
  title: string;
  description: string;
  location: string | null;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  /** Teammates on the meeting (D-042). */
  others?: { name: string; email: string }[];
  /** REQUEST adds or updates the event; CANCEL removes it. */
  method: "REQUEST" | "CANCEL";
  /** Bumped on every change (0 when booked, 1 when cancelled). */
  sequence: number;
  stamp?: Date;
};

/** 20261104T053000Z */
export const icsTime = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Escapes text for a calendar value (backslash, semicolon, comma, new lines). */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes continue on the next line, starting with a space. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > 75) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

const cn = (name: string) => `"${name.replace(/"/g, "'")}"`;

export function buildIcs(e: CalendarEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lumor//Sales Hub//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${e.method}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${icsTime(e.stamp ?? new Date())}`,
    `DTSTART:${icsTime(e.start)}`,
    `DTEND:${icsTime(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(e.description)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    `ORGANIZER;CN=${cn(e.organizer.name)}:mailto:${e.organizer.email}`,
    `ATTENDEE;CN=${cn(e.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:${e.attendee.email}`,
    ...(e.others ?? []).map(
      (o) =>
        `ATTENDEE;CN=${cn(o.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${o.email}`,
    ),
    `STATUS:${e.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SEQUENCE:${e.sequence}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarLink(
  e: Pick<CalendarEvent, "start" | "end" | "title" | "description" | "location">,
) {
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsTime(e.start)}/${icsTime(e.end)}`,
    details: e.description,
    ...(e.location ? { location: e.location } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
