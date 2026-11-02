// F22: the calendar file every invite carries.
import { describe, expect, it } from "vitest";
import { buildIcs, foldLine, googleCalendarLink, icsText } from "./ics";

const EVENT = {
  uid: "b1@lumor-sales-hub",
  start: new Date("2026-11-04T05:30:00Z"),
  end: new Date("2026-11-04T06:00:00Z"),
  title: "Lumor demo: Priya Sharma and Somnath",
  description: "Booked from the Lumor booking page.\nNote: agenda, please",
  location: "https://meet.google.com/abc-defg-hij",
  organizer: { name: "Somnath", email: "somnath@lumor.tech" },
  attendee: { name: "Priya Sharma", email: "priya@acme.example" },
  method: "REQUEST" as const,
  sequence: 0,
  stamp: new Date("2026-11-02T03:30:00Z"),
};

describe("calendar file (F22)", () => {
  it("has the event in UTC, the organiser, the attendee and CRLF line ends", () => {
    const ics = buildIcs(EVENT);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("DTSTART:20261104T053000Z\r\n");
    expect(ics).toContain("DTEND:20261104T060000Z\r\n");
    expect(ics).toContain("UID:b1@lumor-sales-hub\r\n");
    expect(ics).toContain('ORGANIZER;CN="Somnath":mailto:somnath@lumor.tech');
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics).toContain(
      "DESCRIPTION:Booked from the Lumor booking page.\\nNote: agenda\\, please",
    );
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("a cancellation keeps the UID and bumps the sequence", () => {
    const ics = buildIcs({ ...EVENT, method: "CANCEL", sequence: 1 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain("UID:b1@lumor-sales-hub");
  });

  it("escapes text and folds long lines", () => {
    expect(icsText("a;b,c\\d")).toBe("a\\;b\\,c\\\\d");
    const folded = foldLine("X".repeat(100));
    expect(folded.split("\r\n").map((l) => l.length)).toEqual([75, 26]);
    expect(folded.split("\r\n")[1].startsWith(" ")).toBe(true);
  });

  it("makes a Google Calendar link", () => {
    const link = new URL(googleCalendarLink(EVENT));
    expect(link.hostname).toBe("calendar.google.com");
    expect(link.searchParams.get("dates")).toBe("20261104T053000Z/20261104T060000Z");
    expect(link.searchParams.get("location")).toBe(EVENT.location);
  });
});
