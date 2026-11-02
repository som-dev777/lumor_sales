// F22: meeting types, public booking, linking to people, cancel and reschedule, limits and the
// double-booking guard.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activity, auditLog, booking, person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { fromIstLocal } from "@/lib/time";
import { generateToken, hashToken } from "@/lib/tokens";
import {
  availabilitySchema,
  bookingFormSchema,
  meetingTypeSchema,
  type BookingFormData,
} from "@/lib/validation/calendar";
import { personSchema } from "@/lib/validation/leads";
import {
  bookingIcs,
  cancelByHost,
  cancelByToken,
  createBooking,
  findBookingPage,
  findByToken,
  freeSlots,
  listBookings,
  meetingsToday,
  profileView,
  rescheduleByToken,
  saveAvailability,
  saveMeetingType,
  setMeetingTypeActive,
} from "./calendar";
import { createPerson, deletePerson } from "./leads/people";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let other: Actor;

// Monday 2 Nov 2026, 09:00 IST.
const NOW = fromIstLocal("2026-11-02T09:00")!;
const TUE_11 = fromIstLocal("2026-11-03T11:00")!.toISOString();
const TUE_14 = fromIstLocal("2026-11-03T14:00")!.toISOString();

beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const demo = (extra: Record<string, unknown> = {}, actor = rep) =>
  saveMeetingType(
    t.db,
    actor,
    null,
    meetingTypeSchema.parse({
      name: "Lumor demo",
      slug: "demo",
      durationMin: 30,
      bufferMin: 0,
      minNoticeHours: 4,
      maxDaysAhead: 14,
      maxPerDay: "",
      questions: [],
      ...extra,
    }),
  );

const form = (extra: Partial<BookingFormData> = {}): BookingFormData =>
  bookingFormSchema.parse({
    startsAt: TUE_11,
    name: "Priya Sharma",
    email: "Priya@Acme.example",
    company: "Acme",
    answers: [],
    timeZone: "Europe/London",
    ...extra,
  });

const book = (extra: Partial<BookingFormData> = {}) =>
  createBooking(t.db, "asha", "demo", form(extra), NOW);

describe("the rep's calendar", () => {
  it("starts Monday–Friday 10–6 with a link name from their first name; saved on first use", async () => {
    const view = await profileView(t.db, { id: rep.id, name: "Asha Rao" });
    expect(view).toMatchObject({ slug: "asha", saved: false });
    expect(view.weeklyHours["1"]).toEqual([{ start: "10:00", end: "18:00" }]);
    await demo();
    expect((await profileView(t.db, { id: rep.id, name: "Asha Rao" })).saved).toBe(true);
    const audit = await t.db.select().from(auditLog);
    expect(audit.map((a) => a.entityType)).toEqual(
      expect.arrayContaining(["Calendar", "Meeting type"]),
    );
  });

  it("hours, days off and link name are saved; a taken link name is refused", async () => {
    await demo({}, admin); // Somnath's calendar, link "somnath"
    const hours = {
      ...(await profileView(t.db, { id: rep.id, name: "Asha" })).weeklyHours,
      "1": [
        { start: "14:00", end: "18:00" },
        { start: "10:00", end: "13:00" },
      ],
    };
    const saved = await saveAvailability(
      t.db,
      rep,
      rep.id,
      availabilitySchema.parse({ slug: "asha-r", weeklyHours: hours, daysOff: ["2026-11-03"] }),
    );
    expect(saved.weeklyHours["1"][0].start).toBe("10:00");
    expect(saved.daysOff).toEqual(["2026-11-03"]);
    await expect(
      saveAvailability(
        t.db,
        rep,
        rep.id,
        availabilitySchema.parse({ slug: "somnath", weeklyHours: hours, daysOff: [] }),
      ),
    ).rejects.toThrow("That link name is taken.");
    expect(
      availabilitySchema.safeParse({
        slug: "x",
        weeklyHours: { ...hours, "2": [{ start: "12:00", end: "11:00" }] },
        daysOff: [],
      }).success,
    ).toBe(false);
  });

  it("only the owner or an Admin manages meeting types; link names are unique per rep", async () => {
    const m = await demo();
    await expect(setMeetingTypeActive(t.db, other, m.id, false)).rejects.toThrow(PermissionError);
    await setMeetingTypeActive(t.db, admin, m.id, false);
    await expect(demo()).rejects.toThrow("already have a meeting type with that link name");
    // Another rep can use the same link name.
    await expect(demo({}, other)).resolves.toBeTruthy();
  });
});

describe("booking from the public page", () => {
  it("offers free slots, books one, and that slot is gone", async () => {
    await demo();
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    const before = await freeSlots(t.db, page, NOW);
    expect(before[0].toISOString()).toBe(fromIstLocal("2026-11-02T13:00")!.toISOString());
    const { booking: b, token } = await book();
    expect(b).toMatchObject({ status: "Confirmed", inviteeEmail: "priya@acme.example" });
    expect(b.manageTokenHash).toBe(hashToken(token));
    const after = await freeSlots(t.db, page, NOW);
    expect(after.map((d) => d.toISOString())).not.toContain(TUE_11);
    expect(after).toHaveLength(before.length - 1);
    // The audit names the rep as the actor, via the booking page.
    const audit = (await t.db.select().from(auditLog)).find((a) => a.entityType === "Booking")!;
    expect(audit.userId).toBe(rep.id);
    expect(audit.changes).toMatchObject({ via: { after: "Booking page" } });
  });

  it("refuses a taken slot, a slot that isn't offered, and the database refuses doubles", async () => {
    await demo();
    await book();
    await expect(book({ email: "other@acme.example" })).rejects.toThrow(
      "That time was just taken.",
    );
    // Too soon (minimum notice is 4 hours).
    await expect(
      book({ startsAt: fromIstLocal("2026-11-02T10:00")!.toISOString() }),
    ).rejects.toThrow("That time was just taken.");
    const [b] = await t.db.select().from(booking);
    await expect(
      t.db.insert(booking).values({ ...b, id: crypto.randomUUID(), manageTokenHash: "x" }),
    ).rejects.toThrow();
  });

  it("an existing person (by email) gets Meeting booked: stage, Hold meeting date and a note", async () => {
    await demo({ questions: [{ label: "What should we cover?", required: false }] });
    const p = await createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: "Priya Sharma",
        linkedinUrl: "linkedin.com/in/priya-cal",
        companyName: "Acme",
        email: "priya@acme.example",
        stage: "Replied",
      }),
    );
    const { booking: b } = await book({ answers: ["Keen on panels"] });
    expect(b.personId).toBe(p.id);
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after).toMatchObject({
      stage: "Meeting scheduled",
      nextAction: "Hold meeting",
      nextActionDate: "2026-11-03",
    });
    const logged = (await t.db.select().from(activity)).find((a) => a.type === "Meeting booked")!;
    expect(logged.content).toContain('Booked "Lumor demo" for Tue 3 Nov 2026, 11:00 am IST');
    expect(logged.content).toContain("Keen on panels");
  });

  it("someone new is added only when they give a LinkedIn profile", async () => {
    await demo();
    const { booking: unlinked } = await book();
    expect(unlinked.personId).toBeNull();
    const { booking: linked } = await book({
      startsAt: TUE_14,
      email: "ravi@beta.example",
      name: "Ravi Kumar",
      company: "Beta Research",
      linkedin: "https://www.linkedin.com/in/ravi-beta",
    });
    const [p] = await t.db
      .select()
      .from(person)
      .where(eq(person.id, linkedin(linked)));
    expect(p).toMatchObject({
      fullName: "Ravi Kumar",
      ownerId: rep.id,
      email: "ravi@beta.example",
    });
    expect(p.stage).toBe("Meeting scheduled");
  });

  it("3 bookings per email per day; the spam trap; required questions; switched-off links", async () => {
    await demo({ questions: [{ label: "What do you research?", required: true }] });
    await expect(book()).rejects.toThrow("What do you research?: This question is required.");
    const slots = ["11:00", "12:00", "14:00", "15:00"].map((h) =>
      fromIstLocal(`2026-11-03T${h}`)!.toISOString(),
    );
    for (const s of slots.slice(0, 3)) await book({ startsAt: s, answers: ["Brands"] });
    await expect(book({ startsAt: slots[3], answers: ["Brands"] })).rejects.toThrow(
      "already booked 3 meetings today",
    );
    await expect(
      createBooking(t.db, "asha", "demo", { ...form(), website: "spam" }, NOW),
    ).rejects.toThrow("Couldn't book");
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    await setMeetingTypeActive(t.db, rep, page.type.id, false);
    await expect(book({ email: "new@x.example" })).rejects.toThrow("isn't taking bookings");
  });
});

const linkedin = (b: { personId: string | null }) => b.personId!;

describe("cancel and reschedule", () => {
  it("the visitor cancels with their code; the person gets a note; twice is refused", async () => {
    await demo();
    await createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: "Priya Sharma",
        linkedinUrl: "linkedin.com/in/priya-c2",
        companyName: "Acme",
        email: "priya@acme.example",
        stage: "Replied",
      }),
    );
    const { token } = await book();
    expect(await findByToken(t.db, generateToken())).toBeNull();
    const cancelled = await cancelByToken(t.db, token, "Clash", NOW);
    expect(cancelled).toMatchObject({ status: "Cancelled", cancelledBy: "invitee" });
    const note = (await t.db.select().from(activity)).find((a) => a.type === "Meeting note")!;
    expect(note.content).toContain("was cancelled by Priya Sharma. Reason: Clash");
    await expect(cancelByToken(t.db, token, null, NOW)).rejects.toThrow("already cancelled");
    // The slot is free again.
    await expect(book()).resolves.toBeTruthy();
  });

  it("rescheduling replaces the booking, keeps the calendar event and moves Hold meeting", async () => {
    await demo();
    const p = await createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: "Priya Sharma",
        linkedinUrl: "linkedin.com/in/priya-c3",
        companyName: "Acme",
        email: "priya@acme.example",
        stage: "Replied",
      }),
    );
    const first = await book();
    const thursday = fromIstLocal("2026-11-05T15:00")!.toISOString();
    const second = await rescheduleByToken(t.db, first.token, thursday, NOW);
    expect(second.booking.rescheduledFromId).toBe(first.booking.id);
    expect(second.booking.personId).toBe(p.id);
    const [old] = await t.db.select().from(booking).where(eq(booking.id, first.booking.id));
    expect(old.status).toBe("Cancelled");
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after.nextActionDate).toBe("2026-11-05");
    // Rescheduling again still points at the first booking (one calendar event).
    const third = await rescheduleByToken(
      t.db,
      second.token,
      fromIstLocal("2026-11-06T15:00")!.toISOString(),
      NOW,
    );
    expect(third.booking.rescheduledFromId).toBe(first.booking.id);
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    expect(bookingIcs(third.booking, page)).toContain(`UID:${first.booking.id}@lumor-sales-hub`);
    // The old code no longer works.
    await expect(rescheduleByToken(t.db, first.token, thursday, NOW)).rejects.toThrow(
      "already cancelled",
    );
  });

  it("the rep or an Admin cancels from the calendar; others can't", async () => {
    await demo();
    const { booking: b } = await book();
    await expect(cancelByHost(t.db, other, b.id, null, NOW)).rejects.toThrow(PermissionError);
    await cancelByHost(t.db, admin, b.id, "Sick", NOW);
    expect((await listBookings(t.db, { userId: rep.id }, "upcoming", NOW))[0].status).toBe(
      "Cancelled",
    );
  });
});

describe("lists", () => {
  it("Today's meetings are today's confirmed bookings, in IST", async () => {
    await demo({ minNoticeHours: 0 });
    await book({ startsAt: fromIstLocal("2026-11-02T15:00")!.toISOString() });
    await book({ startsAt: TUE_11, email: "x@y.example" });
    const today = await meetingsToday(t.db, rep.id, NOW);
    expect(today.map((m) => m.inviteeName)).toEqual(["Priya Sharma"]);
  });

  it("deleting a person keeps their bookings, unlinked", async () => {
    await demo();
    const { booking: b } = await book({ linkedin: "linkedin.com/in/priya-del" });
    await deletePerson(t.db, admin, b.personId!);
    const [row] = await t.db.select().from(booking).where(eq(booking.id, b.id));
    expect(row.personId).toBeNull();
  });
});
