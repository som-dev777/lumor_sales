// F22 round 3 and F27 (D-043): the booking form's standard fields, online or in person, the
// owner's emails, reminders, the booking sync (person, stage, plan), Schedule a meeting with To
// and CC, and the Calendly webhook.
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activity,
  auditLog,
  booking,
  calendlyBooking,
  notification,
  person,
  plan,
  planEnrolment,
} from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { fromIstLocal, toIstDate } from "@/lib/time";

const istDay = (d: Date) => toIstDate(d);
import {
  bookingFormSchema,
  checkStandardFields,
  meetingTypeSchema,
  scheduleMeetingSchema,
  type BookingFormInput,
} from "@/lib/validation/calendar";
import { personSchema } from "@/lib/validation/leads";
import {
  confirmationMail,
  reminder1Mail,
  reminder24Mail,
  repBookedMail,
  repCancelledMail,
} from "./booking-emails";
import { companyFrom } from "./booking-sync";
import {
  addGuest,
  removeGuest,
  slotReport,
  BookingFieldsError,
  cancelByToken,
  createBooking,
  rescheduleByHost,
  rescheduleByToken,
  saveAvailability,
  saveMeetingType,
  scheduleMeeting,
  sendDueReminders,
  whereOf,
  findBookingPage,
  freeSlots,
} from "./calendar";
import { calendlySchema, handleCalendly, verifyCalendlySignature } from "./calendly";
import { createPerson } from "./leads/people";
import { enrolPeople, liveEnrolment } from "./plans/enrolment";
import { seedPlans } from "./plans/seed";
import { POST as calendlyRoute } from "@/app/api/calendly/webhook/route";
import { POST as remindersRoute } from "@/app/api/cron/reminders/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
let mails: { to: string[]; cc: string[]; subject: string; text: string }[];

// Monday 2 Nov 2026, 09:00 IST.
const NOW = fromIstLocal("2026-11-02T09:00")!;
const at = (local: string) => fromIstLocal(local)!.toISOString();
const WED_11 = at("2026-11-04T11:00");

beforeEach(async () => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret-for-google-token-encryption";
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath Chakraborty", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  mails = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  t.cleanup();
});

/** Email "on", with Resend faked: every email is captured. */
function emailOn() {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Lumor <hub@lumor.tech>");
  vi.stubEnv("BETTER_AUTH_URL", "https://hub.example");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url === "https://api.resend.com/emails") {
        const b = JSON.parse(String(init.body));
        mails.push({ to: b.to, cc: b.cc ?? [], subject: b.subject, text: b.text });
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

const demo = (extra: Record<string, unknown> = {}, actor = rep) =>
  saveMeetingType(
    t.db,
    actor,
    null,
    meetingTypeSchema.parse({
      name: "Lumor Demo: see your research in 20 minutes",
      slug: "demo",
      durationMin: 20,
      bufferMin: 0,
      minNoticeHours: 4,
      maxDaysAhead: 14,
      maxPerDay: "",
      questions: [],
      emailName: "Lumor demo",
      emailNote: "Have a study you’re working on to hand.",
      ...extra,
    }),
  );

const form = (extra: Partial<BookingFormInput> = {}) =>
  bookingFormSchema.parse({
    startsAt: WED_11,
    name: "Priya Sharma",
    email: "priya@acme.example",
    company: "Acme",
    mode: "online",
    answers: [],
    timeZone: "Asia/Kolkata",
    ...extra,
  });

const book = (extra: Partial<BookingFormInput> = {}) =>
  createBooking(t.db, "asha", "demo", form(extra), NOW);

async function priyaOnPlan() {
  await seedPlans(t.db, admin.id);
  const [outreach] = await t.db.select().from(plan).where(eq(plan.name, "Official Outreach"));
  const p = await createPerson(
    t.db,
    rep,
    personSchema.parse({
      fullName: "Priya Sharma",
      linkedinUrl: "linkedin.com/in/priya-r3",
      companyName: "Acme",
      email: "priya@acme.example",
      stage: "Connected",
    }),
  );
  await enrolPeople(t.db, rep, [p.id], outreach.id, NOW);
  return p;
}

describe("the booking form's standard fields (D-043)", () => {
  it("defaults: company required, phone and LinkedIn optional, online or in person required", () => {
    expect(checkStandardFields(null, { company: "", mode: null })).toEqual({
      company: "Enter your company.",
      mode: "Choose online or in person.",
    });
    const rules = {
      company: { show: false, required: true },
      phone: { show: true, required: true },
      linkedin: { show: true, required: false },
      mode: { show: false, required: true },
    };
    // A hidden field is never required.
    expect(checkStandardFields(rules, { company: "", phone: "", mode: null })).toEqual({
      phone: "Enter your phone number.",
    });
  });

  it("the server enforces the event's switches; hidden fields aren't stored", async () => {
    await demo({
      standardFields: {
        company: { show: false, required: false },
        phone: { show: true, required: true },
        linkedin: { show: true, required: false },
        mode: { show: false, required: false },
      },
    });
    const err = await book({ phone: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(BookingFieldsError);
    expect(err.fields).toEqual({ phone: "Enter your phone number." });
    const { booking: b } = await book({
      phoneCountry: "IN",
      phone: "98765 43210",
      mode: "in_person",
    });
    // Company is hidden (stored empty); how to meet is hidden (always online).
    expect(b).toMatchObject({
      inviteeCompany: "",
      mode: "online",
      inviteePhone: "+91 98765 43210",
    });
  });

  it("an in-person booking uses the event's address and makes no Meet link", async () => {
    await demo({ inPersonAddress: "Lumor, Indiranagar, Bengaluru" });
    const { booking: b } = await book({ mode: "in_person" });
    expect(b.mode).toBe("in_person");
    expect(b.meetLink).toBeNull();
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    expect(whereOf(b, page)).toBe("In person: Lumor, Indiranagar, Bengaluru");
  });
});

describe("booking sync to the person (D-043)", () => {
  it("found by email: Meeting booked with the answers, Meeting scheduled, plan paused, on Today", async () => {
    await demo({ questions: [{ label: "Your role", required: true }] });
    const p = await priyaOnPlan();
    const { booking: b } = await book({ email: "PRIYA@acme.example", answers: ["Research Head"] });
    expect(b.personId).toBe(p.id);
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after).toMatchObject({
      stage: "Meeting scheduled",
      nextAction: "Hold meeting",
      nextActionDate: "2026-11-04",
      reviewNote: null,
    });
    const logged = (await t.db.select().from(activity).where(eq(activity.personId, p.id))).find(
      (a) => a.type === "Meeting booked",
    )!;
    expect(logged.content).toContain("Your role: Research Head");
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Paused");
  });

  it("found by name + company when the email differs", async () => {
    await demo();
    const p = await createPerson(
      t.db,
      rep,
      personSchema.parse({
        fullName: "Priya  Sharma",
        linkedinUrl: "linkedin.com/in/priya-name",
        companyName: "ACME",
        stage: "Replied",
      }),
    );
    const { booking: b } = await book({ email: "p.sharma@gmail.com", name: "priya sharma" });
    expect(b.personId).toBe(p.id);
  });

  it("a cancel moves them back to Replied and resumes the plan; a reschedule is one Meeting moved", async () => {
    await demo();
    const p = await priyaOnPlan();
    const first = await book();
    const moved = await rescheduleByToken(t.db, first.token, at("2026-11-04T14:00"), NOW);
    const notes = (await t.db.select().from(activity).where(eq(activity.personId, p.id))).filter(
      (a) => a.type === "Meeting note",
    );
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toContain("Meeting moved:");
    expect((await t.db.select().from(person).where(eq(person.id, p.id)))[0].stage).toBe(
      "Meeting scheduled",
    );
    await cancelByToken(t.db, moved.token, "Budget review", NOW);
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after).toMatchObject({ stage: "Replied", nextAction: "Respond" });
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Active");
    const cancelled = (await t.db.select().from(activity).where(eq(activity.personId, p.id))).find(
      (a) => a.content?.startsWith("Meeting cancelled"),
    )!;
    expect(cancelled.content).toContain("Reason: Budget review.");
  });
});

describe("the owner's emails (D-043)", () => {
  it("the booked person gets the confirmation; the rep gets the booked email with Open in Sales Hub", async () => {
    emailOn();
    await saveAvailability(t.db, rep, rep.id, {
      slug: "asha",
      weeklyHours: {
        "1": [{ start: "10:00", end: "18:00" }],
        "2": [{ start: "10:00", end: "18:00" }],
        "3": [{ start: "10:00", end: "18:00" }],
        "4": [{ start: "10:00", end: "18:00" }],
        "5": [{ start: "10:00", end: "18:00" }],
        "6": [],
        "7": [],
      },
      daysOff: [],
      notifyEmail: null,
      emailTitle: "Co-founder, Lumor",
      useGoogleBusy: true,
    });
    await demo({ questions: [{ label: "Your role", required: false }] });
    const p = await priyaOnPlan();
    await book({ answers: ["Research Head"] });
    const toPriya = mails.find((m) => m.to.includes("priya@acme.example"))!;
    // The event's title first, then the date (D-047); the calendar file is attached.
    expect(toPriya.subject).toBe(
      "Lumor Demo: see your research in 20 minutes · Wednesday 4 November at 11:00 am",
    );
    expect(toPriya.text).toContain("You’re booked");
    expect(toPriya.text).toContain("Hi Priya,");
    expect(toPriya.text).toContain("Thanks for booking a Lumor demo.");
    expect(toPriya.text).toContain("With: Asha Rao, Co-founder, Lumor");
    expect(toPriya.text).toContain("Have a study you’re working on to hand.");
    expect(toPriya.text).toContain("[ Reschedule or cancel ] → https://hub.example/booking/");
    const toAsha = mails.find((m) => m.subject.startsWith("Lumor demo booked:"))!;
    expect(toAsha.subject).toBe(
      "Lumor demo booked: Priya Sharma, Acme · Wednesday 4 November at 11:00 am IST",
    );
    expect(toAsha.text).toContain(
      "Priya Sharma (Research Head at Acme) booked a 20-minute Lumor demo.",
    );
    expect(toAsha.text).toContain(
      "Sales Hub has already logged “Meeting booked”, moved them to Meeting scheduled, and paused their outreach plan.",
    );
    expect(toAsha.text).toContain(`[ Open in Sales Hub ] → https://hub.example/people/${p.id}`);
  });

  it("the builders follow the copy, including the new-lead and no-plan lines", () => {
    const start = new Date("2026-11-04T05:30:00Z");
    const base = {
      inviteeName: "Priya Sharma",
      eventName: "Lumor demo",
      startsAt: start,
      timeZone: "Europe/London",
      durationMin: 30,
      where: { kind: "meet", link: "https://meet.google.com/abc" } as const,
      hostName: "Somnath Chakraborty",
      hostTitle: "Co-founder, Lumor",
      note: null,
      manageUrl: "https://hub.example/booking/x",
    };
    expect(confirmationMail(base).content.rows[0][1]).toBe(
      "Wednesday 4 November, 5:30 am (Greenwich Mean Time), 30 minutes",
    );
    expect(reminder24Mail(base).subject).toBe("Tomorrow: your Lumor demo at 5:30 am");
    expect(reminder24Mail(base).content.intro[0]).toBe(
      "Hi Priya, a quick reminder that we’re meeting tomorrow at 5:30 am on Google Meet: https://meet.google.com/abc. If the time no longer works, you can pick another slot.",
    );
    expect(reminder1Mail(base).subject).toBe("Starting in an hour: Lumor demo");
    expect(reminder1Mail(base).content.intro[0]).toBe(
      "Hi Priya, see you at 5:30 am: https://meet.google.com/abc.",
    );
    const rep = {
      name: "Priya Sharma",
      company: "Acme",
      eventName: "Lumor demo",
      startsAt: start,
      durationMin: 20,
      where: base.where,
      answers: [{ question: "Wants to see", answer: "" }],
      openUrl: "https://hub.example/people/1",
    };
    const fresh = repBookedMail({ ...rep, created: true, planPaused: false });
    expect(fresh.content.after![0]).toBe(
      "This person wasn’t in Sales Hub, so a new lead was created and assigned to you. Check the company and persona.",
    );
    expect(fresh.content.rows).toContainEqual(["Wants to see", "Nothing added"]);
    expect(repBookedMail({ ...rep, created: false, planPaused: false }).content.after![0]).toBe(
      "Sales Hub has already logged “Meeting booked”, moved them to Meeting scheduled.",
    );
    const c = repCancelledMail({ ...rep, reason: null, by: "Priya Sharma", planResumed: true });
    expect(c.subject).toBe("Lumor demo cancelled: Priya Sharma, Acme");
    expect(c.content.intro[0]).toBe(
      "Priya Sharma cancelled the Lumor demo on Wednesday 4 November. Reason: None given. Their plan has resumed so you can follow up.",
    );
  });

  it("the company for a new person: given, else the email domain, never a free-mail domain", () => {
    expect(companyFrom(" Acme ", "a@x.com")).toBe("Acme");
    expect(companyFrom("", "a@beta-research.in")).toBe("beta-research.in");
    expect(companyFrom(null, "a@gmail.com")).toBe("Not given");
  });
});

describe("reminders (D-043)", () => {
  it("24 hours and 1 hour before, once each; not for late bookings or cancelled meetings", async () => {
    emailOn();
    await demo();
    const { booking: b } = await book();
    // Booked on Monday 09:00 for Wednesday 11:00.
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-03T10:00")!)).toEqual({ sent: 0 });
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-03T11:05")!)).toEqual({ sent: 1 });
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-03T11:20")!)).toEqual({ sent: 0 });
    expect(mails.at(-1)!.subject).toBe("Tomorrow: your Lumor demo at 11:00 am");
    expect(mails.at(-1)!.text).toContain("[ Choose a new time ] → https://hub.example/booking/");
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-04T10:00")!)).toEqual({ sent: 1 });
    expect(mails.at(-1)!.subject).toBe("Starting in an hour: Lumor demo");
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-04T10:30")!)).toEqual({ sent: 0 });
    const [row] = await t.db.select().from(booking).where(eq(booking.id, b.id));
    expect(row.reminder24At).not.toBeNull();
    expect(row.reminder1At).not.toBeNull();
    const audit = await t.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityType, "Booking"), eq(auditLog.recordId, b.id)));
    expect(audit.filter((a) => JSON.stringify(a.changes).includes("Reminder"))).toHaveLength(2);
  });

  it("a cancelled meeting gets none; a meeting booked 3 hours ahead gets only the 1-hour one", async () => {
    emailOn();
    await demo({ minNoticeHours: 0 });
    const { token } = await book();
    await cancelByToken(t.db, token, null, NOW);
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-03T11:05")!)).toEqual({ sent: 0 });
    const late = await createBooking(
      t.db,
      "asha",
      "demo",
      form({ startsAt: at("2026-11-02T12:00"), email: "late@acme.example" }),
      NOW,
    );
    expect(late.booking.personId).not.toBeNull();
    expect(await sendDueReminders(t.db, fromIstLocal("2026-11-02T11:00")!)).toEqual({ sent: 1 });
    expect(mails.at(-1)!.subject).toBe("Starting in an hour: Lumor demo");
  });

  it("the cron route needs the secret", async () => {
    vi.stubEnv("CRON_SECRET", "a-long-enough-secret-123");
    const call = (auth?: string) =>
      remindersRoute(
        new Request("https://hub.example/api/cron/reminders", {
          method: "POST",
          headers: auth ? { authorization: auth } : {},
        }),
      );
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
  });
});

describe("Schedule a meeting (D-043)", () => {
  it("To and CC are checked; the meeting is emailed to To with CC copied, linked to the person", async () => {
    emailOn();
    const p = await priyaOnPlan();
    const bad = scheduleMeetingSchema.safeParse({
      title: "Walkthrough",
      date: "2026-11-05",
      time: "15:00",
      durationMin: 30,
      how: "link",
      place: "zoom",
      to: "",
    });
    expect(bad.success).toBe(false);
    const data = scheduleMeetingSchema.parse({
      title: "Lumor walkthrough",
      date: "2026-11-05",
      time: "15:00",
      durationMin: 45,
      how: "in_person",
      place: "Acme office, Pune",
      to: "Priya@acme.example, ravi@acme.example",
      cc: "ravi@acme.example; boss@lumor.tech",
      message: "Bring the tracker deck.",
    });
    expect(data.cc).toEqual(["boss@lumor.tech"]);
    const b = await scheduleMeeting(t.db, rep, data, NOW);
    expect(b).toMatchObject({
      title: "Lumor walkthrough",
      mode: "in_person",
      location: "Acme office, Pune",
      toEmails: ["priya@acme.example", "ravi@acme.example"],
      ccEmails: ["boss@lumor.tech"],
      personId: p.id,
    });
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Paused");
    const sent = mails.find((m) => m.subject.startsWith("Lumor walkthrough ·"))!;
    expect(sent.to).toEqual(["priya@acme.example", "ravi@acme.example"]);
    expect(sent.cc).toEqual(["boss@lumor.tech"]);
    expect(sent.text).toContain("Asha Rao has invited you to Lumor walkthrough.");
    expect(sent.text).toContain("Bring the tracker deck.");
    // It moves to any time the rep picks, and the hidden event never shows publicly.
    const moved = await rescheduleByHost(t.db, rep, b.id, at("2026-11-07T19:30"), NOW);
    expect(moved.booking.title).toBe("Lumor walkthrough");
    expect(await findBookingPage(t.db, "asha", "scheduled")).toBeNull();
    await expect(
      scheduleMeeting(t.db, rep, { ...data, date: "2026-11-07", time: "19:45" }, NOW),
    ).rejects.toThrow("You already have a meeting at that time.");
  });
});

describe("Calendly (F27)", () => {
  const KEY = "calendly-signing-key";
  const payload = (over: Record<string, unknown> = {}, event = "invitee.created") => ({
    event,
    payload: {
      uri: "https://api.calendly.com/scheduled_events/E1/invitees/I1",
      email: "neha@delta.example",
      name: "Neha Kapoor",
      rescheduled: false,
      old_invitee: null,
      questions_and_answers: [
        { question: "Company name", answer: "Delta Insights" },
        { question: "What do you want to see?", answer: "AI analysis" },
      ],
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/E1",
        name: "Lumor demo",
        start_time: "2026-11-05T09:30:00.000000Z",
        end_time: "2026-11-05T10:00:00.000000Z",
        location: { type: "google_conference", join_url: "https://meet.google.com/xyz" },
      },
      ...over,
    },
  });
  const signed = (body: string, now = Date.now(), key = KEY) => {
    const ts = Math.floor(now / 1000);
    const sig = createHmac("sha256", key).update(`${ts}.${body}`).digest("hex");
    return `t=${ts},v1=${sig}`;
  };

  it("checks the signature: right key, recent, and closed without a key", async () => {
    const body = JSON.stringify(payload());
    expect(verifyCalendlySignature(signed(body), body, KEY)).toBe(true);
    expect(verifyCalendlySignature(signed(body, Date.now(), "other"), body, KEY)).toBe(false);
    expect(verifyCalendlySignature(signed(body, Date.now() - 10 * 60_000), body, KEY)).toBe(false);
    expect(verifyCalendlySignature(signed(body), body + " ", KEY)).toBe(false);
    expect(verifyCalendlySignature(signed(body), body, undefined)).toBe(false);
    vi.stubEnv("CALENDLY_WEBHOOK_SIGNING_KEY", KEY);
    const res = await calendlyRoute(
      new Request("https://hub.example/api/calendly/webhook", {
        method: "POST",
        headers: { "calendly-webhook-signature": "t=1,v1=nope" },
        body,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("unmatched: a new person owned by the default Admin, flagged; matched next time; once only", async () => {
    emailOn();
    const e = calendlySchema.parse(payload());
    expect(await handleCalendly(t.db, e, NOW)).toBe("booked");
    const [neha] = await t.db.select().from(person).where(eq(person.email, "neha@delta.example"));
    expect(neha).toMatchObject({
      ownerId: admin.id,
      stage: "Meeting scheduled",
      nextActionDate: "2026-11-05",
      reviewNote: "From Calendly: check details",
      linkedinUrl: null,
    });
    const logged = (await t.db.select().from(activity).where(eq(activity.personId, neha.id))).find(
      (a) => a.type === "Meeting booked",
    )!;
    expect(logged.content).toContain("https://meet.google.com/xyz");
    expect(logged.content).toContain("What do you want to see?: AI analysis");
    expect(await handleCalendly(t.db, e, NOW)).toBe("duplicate");
    expect(await t.db.select().from(calendlyBooking)).toHaveLength(1);
    expect(
      mails.some((m) => m.subject.startsWith("Lumor demo booked: Neha Kapoor, Delta Insights")),
    ).toBe(true);
    const [n] = await t.db.select().from(notification).where(eq(notification.userId, admin.id));
    expect(n.kind).toBe("calendly");
  });

  it("matched by email: Meeting booked as their owner and the plan pauses; cancel resumes it", async () => {
    const p = await priyaOnPlan();
    const created = calendlySchema.parse(
      payload({ email: "priya@acme.example", name: "Priya Sharma" }),
    );
    expect(await handleCalendly(t.db, created, NOW)).toBe("booked");
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Paused");
    const [booked] = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, p.id), eq(activity.type, "Meeting booked")));
    expect(booked.userId).toBe(rep.id);
    const cancel = calendlySchema.parse(
      payload(
        {
          email: "priya@acme.example",
          name: "Priya Sharma",
          cancellation: { reason: "Travelling", canceled_by: "Priya Sharma" },
        },
        "invitee.canceled",
      ),
    );
    expect(await handleCalendly(t.db, cancel, NOW)).toBe("cancelled");
    expect(await handleCalendly(t.db, cancel, NOW)).toBe("duplicate");
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after.stage).toBe("Replied");
    expect((await liveEnrolment(t.db, p.id))!.status).toBe("Active");
    const [enrol] = await t.db.select().from(planEnrolment).where(eq(planEnrolment.personId, p.id));
    expect(enrol.status).toBe("Active");
  });

  it("a reschedule is one Meeting moved, not a cancel", async () => {
    const p = await priyaOnPlan();
    const who = { email: "priya@acme.example", name: "Priya Sharma" };
    await handleCalendly(t.db, calendlySchema.parse(payload(who)), NOW);
    const first = calendlySchema.parse(payload({ ...who, rescheduled: true }, "invitee.canceled"));
    expect(await handleCalendly(t.db, first, NOW)).toBe("waiting for the new time");
    const second = calendlySchema.parse(
      payload({
        ...who,
        uri: "https://api.calendly.com/scheduled_events/E2/invitees/I2",
        old_invitee: "https://api.calendly.com/scheduled_events/E1/invitees/I1",
        scheduled_event: {
          name: "Lumor demo",
          start_time: "2026-11-06T09:30:00Z",
          end_time: "2026-11-06T10:00:00Z",
        },
      }),
    );
    expect(await handleCalendly(t.db, second, NOW)).toBe("moved");
    const [after] = await t.db.select().from(person).where(eq(person.id, p.id));
    expect(after).toMatchObject({ stage: "Meeting scheduled", nextActionDate: "2026-11-06" });
    const acts = await t.db.select().from(activity).where(eq(activity.personId, p.id));
    expect(acts.filter((a) => a.content?.startsWith("Meeting moved"))).toHaveLength(1);
    expect(acts.filter((a) => a.content?.startsWith("Meeting cancelled"))).toHaveLength(0);
    const rows = await t.db.select().from(calendlyBooking);
    expect(rows.map((r) => r.status).sort()).toEqual(["Booked", "Moved"]);
  });
});

describe("people without LinkedIn (D-043)", () => {
  it("need an email instead; the duplicate check uses the email", async () => {
    expect(
      personSchema.safeParse({ fullName: "No Contact", companyName: "Acme", stage: "Prospect" })
        .success,
    ).toBe(false);
    const data = personSchema.parse({
      fullName: "Email Only",
      companyName: "Acme",
      email: "only@acme.example",
      stage: "Prospect",
    });
    await createPerson(t.db, rep, data);
    await expect(createPerson(t.db, rep, data)).rejects.toThrow("Already added by Asha Rao.");
  });
});

describe("guests by email and the slot report (D-045)", () => {
  it("anyone on the meeting adds a guest by email; duplicates are refused; it can be removed", async () => {
    emailOn();
    await demo();
    const { booking: b } = await book();
    const outsider = {
      id: (await insertTestUser(t.db, { name: "Outsider" })).id,
      role: "User" as const,
      active: true,
    };
    await expect(addGuest(t.db, outsider, b.id, "cfo@acme.example", NOW)).rejects.toThrow(
      "Only the host",
    );
    const after = await addGuest(t.db, rep, b.id, "CFO@acme.example", NOW);
    expect(after.ccEmails).toEqual(["cfo@acme.example"]);
    // Without Google, the guest gets our invitation with a calendar file.
    expect(mails.some((m) => m.to.includes("cfo@acme.example") && m.subject.includes(" · "))).toBe(
      true,
    );
    await expect(addGuest(t.db, rep, b.id, "priya@acme.example", NOW)).rejects.toThrow(
      "already on this meeting",
    );
    const removed = await removeGuest(t.db, rep, b.id, "cfo@acme.example", NOW);
    expect(removed.ccEmails).toEqual([]);
  });

  it("the report shows each day's hours, what blocks them and the times offered", async () => {
    await demo();
    await book();
    const r = (await slotReport(t.db, rep.id, NOW, 3))!;
    expect(r.google).toBeNull(); // Google isn't connected here
    const wed = r.days.find((d) => d.date === "2026-11-04")!;
    expect(wed.hours).toBe("10:00–18:00");
    expect(wed.blocked[0]).toMatchObject({ from: "11:00 am", reason: "A meeting" });
    expect(wed.offered[0].count).toBeGreaterThan(0);
    expect(r.rules[0]).toMatchObject({ durationMin: 20, minNoticeHours: 4 });
  });
});

describe("taken times and why times are missing (D-047)", () => {
  it("a booked time, and a meeting Fay scheduled herself, aren't offered to anyone else", async () => {
    await demo();
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    const before = (await freeSlots(t.db, page, NOW)).map((d) => d.toISOString());
    expect(before).toContain(WED_11);
    await book();
    await scheduleMeeting(
      t.db,
      rep,
      scheduleMeetingSchema.parse({
        title: "Internal sync",
        date: "2026-11-04",
        time: "15:00",
        durationMin: 60,
        how: "meet",
        to: "ops@lumor.tech",
      }),
      NOW,
    );
    const after = (await freeSlots(t.db, page, NOW)).map((d) => d.toISOString());
    expect(after).not.toContain(WED_11);
    expect(after).not.toContain(at("2026-11-04T15:00"));
    expect(after).not.toContain(at("2026-11-04T15:40"));
    // Someone else trying the same time is refused.
    await expect(book({ email: "other@beta.example" })).rejects.toThrow("just taken");
    await expect(
      book({ email: "late@beta.example", startsAt: at("2026-11-04T15:20") }),
    ).rejects.toThrow("just taken");
  });

  it("every start the hours allow is offered on every day, and each missing one says why", async () => {
    await saveAvailability(t.db, rep, rep.id, {
      slug: "asha",
      weeklyHours: {
        "1": [{ start: "11:00", end: "19:30" }],
        "2": [{ start: "11:00", end: "19:30" }],
        "3": [
          { start: "11:00", end: "13:00" },
          { start: "14:00", end: "19:30" },
        ],
        "4": [{ start: "11:00", end: "19:30" }],
        "5": [{ start: "11:00", end: "19:30" }],
        "6": [],
        "7": [],
      },
      daysOff: [],
      notifyEmail: null,
      emailTitle: null,
      useGoogleBusy: true,
    });
    await demo({ durationMin: 30, bufferMin: 10, minNoticeHours: 0 });
    const page = (await findBookingPage(t.db, "asha", "demo"))!;
    const slots = await freeSlots(t.db, page, NOW);
    // Mon 2 Nov from 09:00: 11:00…19:00 every 30 min = 17. Wed: 11:00–12:30 (4) + 14:00–19:00 (11).
    expect(slots.filter((s) => istDay(s) === "2026-11-02")).toHaveLength(17);
    expect(slots.filter((s) => istDay(s) === "2026-11-04")).toHaveLength(15);
    expect(slots.filter((s) => istDay(s) === "2026-11-07")).toHaveLength(0);
    // A booking at 12:00 with a 10-minute gap also takes out 11:30 and 12:30, and says so.
    await book({ startsAt: at("2026-11-04T12:00") });
    const r = (await slotReport(t.db, rep.id, NOW, 3))!;
    const wed = r.days.find((d) => d.date === "2026-11-04")!.offered[0];
    expect(wed).toMatchObject({ possible: 15, count: 12 });
    expect(wed.missing).toEqual([
      { time: "11:30", reason: "too close to a meeting (the gap)" },
      { time: "12:00", reason: "a meeting" },
      { time: "12:30", reason: "too close to a meeting (the gap)" },
    ]);
  });
});
