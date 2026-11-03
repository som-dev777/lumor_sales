// F22 round 2, F25, F26 (D-042): question types, booking form checks, teammates, notifications,
// rep reschedule, Google Calendar (faked) and the busy times it adds.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No real Gmail in tests: the Gmail sender gets a stand-in that accepts everything.
vi.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: async () => ({}) }),
}));
import {
  auditLog,
  booking,
  calendarProfile,
  googleConnection,
  notification,
} from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { fromIstLocal } from "@/lib/time";
import {
  availabilitySchema,
  bookingFormSchema,
  checkAnswers,
  meetingTypeSchema,
  type BookingFormInput,
} from "@/lib/validation/calendar";
import {
  addTeammate,
  cancelByHost,
  cancelByToken,
  createBooking,
  findBookingPage,
  freeSlots,
  listBookings,
  meetingsToday,
  removeTeammate,
  rescheduleByHost,
  saveMeetingType,
  teamOf,
} from "./calendar";
import { decryptSecret, encryptSecret } from "./google/crypto";
import { saveConnection } from "./google/google";
import { listNotifications, markRead, unreadCount } from "./notifications";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let mate: Actor;
let outsider: Actor;

// Monday 2 Nov 2026, 09:00 IST.
const NOW = fromIstLocal("2026-11-02T09:00")!;
const at = (local: string) => fromIstLocal(local)!.toISOString();
const TUE_11 = at("2026-11-03T11:00");
const TUE_14 = at("2026-11-03T14:00");

beforeEach(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-for-google-token-encryption";
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  mate = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  outsider = { id: (await insertTestUser(t.db, { name: "Meera" })).id, role: "User", active: true };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  t.cleanup();
});

const demo = (extra: Record<string, unknown> = {}, actor = rep, slug = "demo") =>
  saveMeetingType(
    t.db,
    actor,
    null,
    meetingTypeSchema.parse({
      name: "Lumor demo",
      slug,
      durationMin: 30,
      bufferMin: 0,
      minNoticeHours: 4,
      maxDaysAhead: 14,
      maxPerDay: "",
      questions: [],
      ...extra,
    }),
  );

const form = (extra: Partial<BookingFormInput> = {}) =>
  bookingFormSchema.parse({
    startsAt: TUE_11,
    name: "Priya Sharma",
    email: "priya@acme.example",
    company: "Acme",
    mode: "online",
    answers: [],
    timeZone: "Asia/Kolkata",
    ...extra,
  });

const book = (extra: Partial<BookingFormInput> = {}, profile = "asha") =>
  createBooking(t.db, profile, "demo", form(extra), NOW);

describe("question types and the booking form", () => {
  it("dropdowns and checkboxes need 2+ choices; up to 10 questions; custom lengths in 5s", () => {
    const base = {
      name: "Demo",
      slug: "demo",
      durationMin: 50,
      bufferMin: 0,
      minNoticeHours: 0,
      maxDaysAhead: 14,
      maxPerDay: "",
    };
    expect(meetingTypeSchema.safeParse({ ...base, questions: [] }).success).toBe(true);
    expect(meetingTypeSchema.safeParse({ ...base, durationMin: 52, questions: [] }).success).toBe(
      false,
    );
    expect(meetingTypeSchema.safeParse({ ...base, durationMin: 300, questions: [] }).success).toBe(
      false,
    );
    const q = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `Q${i}`, required: false, type: "short" }));
    expect(meetingTypeSchema.safeParse({ ...base, questions: q(10) }).success).toBe(true);
    expect(meetingTypeSchema.safeParse({ ...base, questions: q(11) }).success).toBe(false);
    const one = meetingTypeSchema.safeParse({
      ...base,
      questions: [{ label: "Team size", required: true, type: "dropdown", options: ["1–10", ""] }],
    });
    expect(one.success).toBe(false);
    const ok = meetingTypeSchema.parse({
      ...base,
      questions: [
        { label: "Team size", required: true, type: "dropdown", options: ["1–10", "11+", "11+"] },
        { label: "Notes", required: false, type: "paragraph", options: ["dropped"] },
      ],
    });
    expect(ok.questions[0].options).toEqual(["1–10", "11+"]);
    expect(ok.questions[1]).not.toHaveProperty("options");
  });

  it("answers are checked against each question's type", () => {
    const qs = [
      { label: "Size", required: true, type: "dropdown" as const, options: ["Small", "Big"] },
      { label: "Topics", required: true, type: "checkboxes" as const, options: ["A", "B", "C"] },
      { label: "Old style", required: false },
    ];
    expect(checkAnswers(qs, ["Small", ["A", "C"], ""])).toEqual({
      ok: true,
      answers: [
        { question: "Size", answer: "Small" },
        { question: "Topics", answer: "A, C" },
        { question: "Old style", answer: "" },
      ],
    });
    expect(checkAnswers(qs, ["Huge", ["A"], ""])).toMatchObject({ ok: false, index: 0 });
    expect(checkAnswers(qs, ["Big", [], ""])).toMatchObject({
      ok: false,
      index: 1,
      message: "Pick at least one.",
    });
    expect(checkAnswers(qs, ["Big", ["Z"], ""])).toMatchObject({ ok: false, index: 1 });
  });

  it("email needs a real domain; phone needs to be valid for its country", () => {
    const bad = (email: string) => !bookingFormSchema.safeParse({ ...form(), email }).success;
    expect(bad("priya@acme")).toBe(true);
    expect(bad("priya.acme.com")).toBe(true);
    expect(bad("priya@acme.c")).toBe(true);
    expect(bad("priya@acme.co.in")).toBe(false);
    expect(bad("Priya@Lumor.Tech")).toBe(false);
    expect(form({ phoneCountry: "IN", phone: "98765 43210" }).phone).toBe("+91 98765 43210");
    expect(form({ phoneCountry: "GB", phone: "07911 123456" }).phone).toBe("+44 7911 123456");
    // A number typed with its own country code wins over the dropdown.
    expect(form({ phoneCountry: "IN", phone: "+1 415 555 2671" }).phone).toBe("+1 415 555 2671");
    expect(
      bookingFormSchema.safeParse({ ...form(), phoneCountry: "IN", phone: "12345" }).success,
    ).toBe(false);
    expect(form({ phone: "" }).phone).toBeNull();
  });

  it("availability allows 12 ranges a day and a notification email", () => {
    const ranges = Array.from({ length: 12 }, (_, i) => ({
      start: `${String(8 + i).padStart(2, "0")}:00`,
      end: `${String(8 + i).padStart(2, "0")}:30`,
    }));
    const week = { "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] };
    const base = { slug: "asha", daysOff: [], weeklyHours: { ...week, "1": ranges } };
    expect(availabilitySchema.safeParse(base).success).toBe(true);
    expect(
      availabilitySchema.safeParse({
        ...base,
        weeklyHours: { ...week, "1": [...ranges, { start: "21:00", end: "21:30" }] },
      }).success,
    ).toBe(false);
    expect(availabilitySchema.parse({ ...base, notifyEmail: "" }).notifyEmail).toBeNull();
    expect(availabilitySchema.parse({ ...base, notifyEmail: "Asha@Lumor.tech" }).notifyEmail).toBe(
      "asha@lumor.tech",
    );
    expect(availabilitySchema.safeParse({ ...base, notifyEmail: "asha@" }).success).toBe(false);
  });

  it("a required dropdown answer is enforced on the server", async () => {
    await demo({
      questions: [{ label: "Team size", required: true, type: "dropdown", options: ["S", "L"] }],
    });
    await expect(book({ answers: [""] })).rejects.toThrow("Team size: Pick one.");
    // A choice that isn't on the list counts as no answer (D-043).
    await expect(book({ answers: ["XL"] })).rejects.toThrow("Team size: Pick one.");
    const { booking: b } = await book({ answers: [" l "] });
    expect(b.answers).toEqual([{ question: "Team size", answer: "L" }]);
  });

  it("a required checkbox question with ticked choices books (the owner's bug, D-043)", async () => {
    const options = [
      "Surveys and questionnaires",
      "NPS / customer feedback",
      "Concept or ad testing",
      "Market research for clients",
      "UX research",
      "Other",
    ];
    await demo({
      questions: [
        { label: "Company name", required: true, type: "short" },
        { label: "Your role", required: true, type: "short" },
        { label: "What kind of research do you run?", required: true, type: "checkboxes", options },
      ],
    });
    // Spacing, case and a choice from an older version of the page don't stop the booking.
    const { booking: b } = await book({
      answers: [
        "Test",
        "Research Head",
        ["NPS  /  Customer feedback", "Surveys and questionnaires", "Retired choice"],
      ],
    });
    expect(b.answers[2]).toEqual({
      question: "What kind of research do you run?",
      answer: "Surveys and questionnaires, NPS / customer feedback",
    });
    await expect(
      book({ startsAt: TUE_14, email: "x@y.example", answers: ["T", "R", ["Retired choice"]] }),
    ).rejects.toThrow("What kind of research do you run?: Pick at least one.");
  });
});

describe("notifications (F25)", () => {
  it("a new booking notifies the host; mark read only touches your own and is audited", async () => {
    await demo();
    await book();
    expect(await unreadCount(t.db, rep.id)).toBe(1);
    const [n] = await listNotifications(t.db, rep.id);
    expect(n).toMatchObject({ kind: "booked", read: false });
    expect(n.title).toBe("New booking: Lumor demo with Priya Sharma");
    expect(n.link).toMatch(/^\/calendar\?booking=/);
    await expect(markRead(t.db, mate, [n.id])).rejects.toThrow(PermissionError);
    expect(await markRead(t.db, rep, null)).toBe(1);
    expect(await unreadCount(t.db, rep.id)).toBe(0);
    expect(await markRead(t.db, rep, null)).toBe(0);
    const audit = await t.db.select().from(auditLog).where(eq(auditLog.entityType, "Notification"));
    expect(audit).toHaveLength(1);
  });
});

describe("teammates on a meeting", () => {
  it("the host adds a teammate: notified, on the team, and their own slots are blocked", async () => {
    await demo();
    await demo({}, mate, "demo"); // Ravi's own booking page /book/ravi/demo
    const { booking: b } = await book();
    const r = await addTeammate(t.db, rep, b.id, mate.id, NOW);
    expect(r).toEqual({ busy: false, name: "Ravi" });
    expect((await teamOf(t.db, b)).map((m) => m.name)).toEqual(["Asha Rao", "Ravi"]);
    const [n] = await listNotifications(t.db, mate.id);
    expect(n).toMatchObject({ kind: "added" });
    expect(n.title).toBe("Asha Rao added Ravi to Lumor demo with Priya Sharma");
    expect(n.body).toContain("On the meeting: Asha Rao (host), Ravi.");
    // Ravi's booking page no longer offers Tuesday 11:00.
    const page = (await findBookingPage(t.db, "ravi", "demo"))!;
    const slots = (await freeSlots(t.db, page, NOW)).map((s) => s.toISOString());
    expect(slots).not.toContain(TUE_11);
    // It's on his Today and in "Just me".
    expect(await meetingsToday(t.db, mate.id, fromIstLocal("2026-11-03T08:00")!)).toHaveLength(1);
    expect(await listBookings(t.db, { userId: mate.id }, "upcoming", NOW)).toHaveLength(1);
    // Twice is refused; someone not on the meeting can't change it.
    await expect(addTeammate(t.db, rep, b.id, mate.id, NOW)).rejects.toThrow("already on");
    await expect(addTeammate(t.db, outsider, b.id, outsider.id, NOW)).rejects.toThrow(
      PermissionError,
    );
    await expect(addTeammate(t.db, rep, b.id, rep.id, NOW)).rejects.toThrow("is hosting");
    // An Admin can change anyone's meeting.
    await addTeammate(t.db, admin, b.id, outsider.id, NOW);
    expect((await teamOf(t.db, b)).map((m) => m.name)).toEqual(["Asha Rao", "Ravi", "Meera"]);
  });

  it("a teammate can add others and leave; a clash is a warning, not a refusal", async () => {
    await demo();
    await demo({}, outsider, "demo");
    const { booking: b } = await book();
    await addTeammate(t.db, rep, b.id, mate.id, NOW);
    // Meera already has a meeting at the same time on her own page.
    await createBooking(t.db, "meera", "demo", form({ email: "x@beta.example" }), NOW);
    const r = await addTeammate(t.db, mate, b.id, outsider.id, NOW);
    expect(r.busy).toBe(true);
    await removeTeammate(t.db, mate, b.id, mate.id, NOW);
    expect((await teamOf(t.db, b)).map((m) => m.name)).toEqual(["Asha Rao", "Meera"]);
    const notes = await listNotifications(t.db, rep.id);
    expect(notes.map((n) => n.title)).toContain("Ravi left Lumor demo with Priya Sharma");
  });

  it("a cancel notifies the host and teammates, not the person who cancelled", async () => {
    await demo();
    const { booking: b } = await book();
    await addTeammate(t.db, rep, b.id, mate.id, NOW);
    await cancelByHost(t.db, rep, b.id, "Clash", NOW);
    const repNotes = await listNotifications(t.db, rep.id);
    expect(repNotes.some((n) => n.kind === "cancelled")).toBe(false);
    const [n] = await listNotifications(t.db, mate.id);
    expect(n).toMatchObject({ kind: "cancelled" });
    expect(n.body).toContain("cancelled by Asha Rao. Reason: Clash");
  });

  it("teammates stay on the meeting when the visitor or host reschedules it", async () => {
    await demo();
    const { booking: b } = await book();
    await addTeammate(t.db, rep, b.id, mate.id, NOW);
    const moved = await rescheduleByHost(t.db, rep, b.id, at("2026-11-03T14:00"), NOW);
    expect((await teamOf(t.db, moved.booking)).map((m) => m.name)).toEqual(["Asha Rao", "Ravi"]);
    const [n] = await listNotifications(t.db, mate.id);
    expect(n).toMatchObject({ kind: "rescheduled" });
    expect(n.body).toContain("by Asha Rao");
    await expect(rescheduleByHost(t.db, mate, moved.booking.id, TUE_11, NOW)).rejects.toThrow(
      PermissionError,
    );
    // The old link stops working: the visitor uses the new one from the email.
    const [old] = await t.db.select().from(booking).where(eq(booking.id, b.id));
    expect(old).toMatchObject({ status: "Cancelled", cancelledBy: "host" });
  });
});

describe("Google Calendar and Meet (F26, Google faked)", () => {
  type Call = { url: string; method: string; body: unknown };
  let calls: Call[];

  function fakeGoogle(opts: {
    failCreate?: boolean;
    busy?: { start: string; end: string }[];
    /** Google makes the Meet link a moment later (D-050). */
    lateMeet?: boolean;
  }) {
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const method = init.method ?? "GET";
        const body =
          typeof init.body === "string" && init.body.startsWith("{")
            ? JSON.parse(init.body)
            : String(init.body ?? "");
        calls.push({ url, method, body });
        const json = (data: unknown, status = 200) =>
          new Response(JSON.stringify(data), { status });
        if (url.startsWith("https://oauth2.googleapis.com/token")) {
          return json({ access_token: "access-1", expires_in: 3600 });
        }
        if (url.includes("/freeBusy")) {
          return json({ calendars: { primary: { busy: opts.busy ?? [] } } });
        }
        if (url.includes("/events") && method === "POST") {
          if (opts.failCreate) return json({ error: "nope" }, 500);
          return opts.lateMeet
            ? json({
                id: "evt-1",
                conferenceData: { createRequest: { status: { statusCode: "pending" } } },
              })
            : json({ id: "evt-1", hangoutLink: "https://meet.google.com/abc-defg-hij" });
        }
        if (url.includes("/events/evt-1") && method === "GET") {
          return json({ id: "evt-1", hangoutLink: "https://meet.google.com/abc-defg-hij" });
        }
        if (url === "https://meet.googleapis.com/v2/spaces/abc-defg-hij") {
          return json({ name: "spaces/space-1", meetingCode: "abc-defg-hij" });
        }
        if (url.startsWith("https://meet.googleapis.com/v2/spaces/space-1?")) {
          return json({ name: "spaces/space-1", config: { accessType: "OPEN" } });
        }
        if (method === "PATCH") return json({ id: "evt-1" });
        if (method === "DELETE") return new Response(null, { status: 204 });
        return json({}, 404);
      }),
    );
  }

  const connect = (actor = rep) =>
    saveConnection(t.db, actor, {
      email: "asha@lumor.tech",
      refreshToken: "refresh-secret",
      scope: "https://www.googleapis.com/auth/calendar.events",
    });

  it("stores the token encrypted, never in the audit log", async () => {
    fakeGoogle({});
    await connect();
    const [row] = await t.db.select().from(googleConnection);
    expect(row.refreshTokenEnc).not.toContain("refresh-secret");
    expect(decryptSecret(row.refreshTokenEnc)).toBe("refresh-secret");
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
    const audit = await t.db.select().from(auditLog);
    expect(JSON.stringify(audit)).not.toContain(row.refreshTokenEnc);
    expect(JSON.stringify(audit)).not.toContain("refresh-secret");
  });

  it("a booking creates a Google event with a Meet link; reschedule moves it; cancel deletes it", async () => {
    fakeGoogle({});
    await demo();
    await connect();
    const { booking: b, token } = await book();
    expect(b).toMatchObject({
      googleEventId: "evt-1",
      meetLink: "https://meet.google.com/abc-defg-hij",
    });
    const create = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect(create.url).toContain("conferenceDataVersion=1");
    // Email isn't set up in this test, so Google sends its own invite (D-049); with email set
    // up, Lumor's emails carry the invite and Google stays quiet (checked below).
    expect(create.url).toContain("sendUpdates=all");
    expect(create.body).toMatchObject({
      conferenceData: { createRequest: { conferenceSolutionKey: { type: "hangoutsMeet" } } },
      attendees: [{ email: "priya@acme.example", displayName: "Priya Sharma" }],
    });
    const moved = await rescheduleByHost(t.db, rep, b.id, at("2026-11-03T14:00"), NOW);
    expect(moved.booking).toMatchObject({ googleEventId: "evt-1", meetLink: b.meetLink });
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/events/evt-1");
    expect(patch.body).toMatchObject({ start: { dateTime: at("2026-11-03T14:00") } });
    expect(token).toBeTruthy();
    await cancelByToken(t.db, moved.token, null, NOW);
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("/events/evt-1"))).toBe(true);
  });

  it("with email set up, Google stays quiet and Lumor's email carries the invite (D-049)", async () => {
    fakeGoogle({});
    vi.stubEnv("GMAIL_USER", "lumor.sales.hub@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcdefghijklmnop");
    await demo();
    await connect();
    await book();
    const create = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    expect(create.url).toContain("sendUpdates=none");
    vi.unstubAllEnvs();
  });

  it("one meeting, one link: the event's own link never appears next to the Meet link (D-050)", async () => {
    fakeGoogle({ lateMeet: true });
    vi.stubEnv("GMAIL_USER", "lumor.sales.hub@gmail.com");
    vi.stubEnv("GMAIL_APP_PASSWORD", "abcdefghijklmnop");
    // An event that also has a fixed online link saved.
    await demo({ location: "https://meet.google.com/old-fixed-link" });
    await connect();
    const { booking: b } = await book();
    // Google gave the Meet link late; the app waited for it.
    expect(b.meetLink).toBe("https://meet.google.com/abc-defg-hij");
    const create = calls.find((c) => c.method === "POST" && c.url.includes("/events"))!;
    const body = create.body as { location?: string; description: string };
    expect(body.location).toBeUndefined();
    expect(body.description).not.toContain("old-fixed-link");
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    const { whereOf } = await import("./calendar");
    expect(whereOf(b, page)).toBe("https://meet.google.com/abc-defg-hij");
    vi.unstubAllEnvs();
  });

  it("the Meet is opened so the person who booked joins without waiting (D-052)", async () => {
    const { connectionView } = await import("./google/google");
    fakeGoogle({});
    await demo();
    // A connection made before D-052 lacks the Meet permission: nothing is changed, and
    // Availability asks the rep to reconnect.
    await connect();
    expect((await connectionView(t.db, rep.id))?.opensMeet).toBe(false);
    await book();
    expect(calls.some((c) => c.url.startsWith("https://meet.googleapis.com"))).toBe(false);
    // Reconnected with it: the booking's Meet is set to open.
    await saveConnection(t.db, rep, {
      email: "asha@lumor.tech",
      refreshToken: "refresh-secret",
      scope:
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/meetings.space.settings",
    });
    expect((await connectionView(t.db, rep.id))?.opensMeet).toBe(true);
    calls = [];
    await book({ email: "second@acme.example", startsAt: at("2026-11-03T12:00") });
    const patch = calls.find((c) => c.url.includes("meet.googleapis.com") && c.method === "PATCH")!;
    expect(patch.url).toBe(
      "https://meet.googleapis.com/v2/spaces/space-1?updateMask=config.accessType",
    );
    expect(patch.body).toEqual({ config: { accessType: "OPEN" } });
  });

  it("adding a teammate updates the Google guests", async () => {
    fakeGoogle({});
    await demo();
    await connect();
    const { booking: b } = await book();
    await addTeammate(t.db, rep, b.id, mate.id, NOW);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect((patch.body as { attendees: unknown[] }).attendees).toHaveLength(2);
  });

  it("Google busy times don't hide slots unless the rep turns that on (D-051)", async () => {
    fakeGoogle({ busy: [{ start: TUE_11, end: at("2026-11-03T12:00") }] });
    await demo();
    await connect();
    // Off by default: the busy time is still offered and can be booked; the rep decides later.
    let page = (await findBookingPage(t.db, "asha", "demo"))!;
    expect((await freeSlots(t.db, page, NOW)).map((s) => s.toISOString())).toContain(TUE_11);
    // Switched on: the busy time is hidden and refused.
    await t.db.update(calendarProfile).set({ useGoogleBusy: true });
    page = (await findBookingPage(t.db, "asha", "demo"))!;
    const slots = (await freeSlots(t.db, page, NOW)).map((s) => s.toISOString());
    expect(slots).not.toContain(TUE_11);
    expect(slots).not.toContain(at("2026-11-03T11:30"));
    expect(slots).toContain(at("2026-11-03T12:00"));
    await expect(book()).rejects.toThrow("That time was just taken.");
    await t.db.update(calendarProfile).set({ useGoogleBusy: false });
    const { booking: b } = await book();
    expect(b.startsAt.toISOString()).toBe(TUE_11);
  });

  it("same-day booking: a new event has no minimum notice (D-051)", async () => {
    const { availableSlots } = await import("@/lib/slots");
    const hours = { "2": [{ start: "10:00", end: "18:00" }] };
    // 3 November 2026 is a Tuesday; at 11:10 IST the 11:30 slot the same day is offered.
    const now = fromIstLocal("2026-11-03T11:10")!;
    const slots = availableSlots({
      hours,
      daysOff: [],
      rules: { durationMin: 30, bufferMin: 0, minNoticeHours: 0, maxDaysAhead: 0, maxPerDay: null },
      busy: [],
      meetingTypeId: "x",
      now,
    });
    expect(slots[0].toISOString()).toBe(fromIstLocal("2026-11-03T11:30")!.toISOString());
  });

  it("when Google fails, the booking stands and the host is told", async () => {
    fakeGoogle({ failCreate: true });
    await demo();
    await connect();
    const { booking: b } = await book();
    expect(b.meetLink).toBeNull();
    const kinds = (await t.db.select().from(notification)).map((n) => n.kind).sort();
    expect(kinds).toEqual(["booked", "google"]);
  });

  it("without Google set up, nothing calls Google", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    await demo();
    const { booking: b } = await book();
    expect(b.googleEventId).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
