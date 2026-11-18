// LinkedIn emails from Gmail (F30, D-066), with Gmail faked: reading the emails, finding the
// person, logging acceptances and replies once, and only for the rep's own people.
import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, auditLog, deskEntry, linkedinEmail, person } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { seedKnowledge } from "../knowledge";
import { readSeedKnowledge } from "../knowledge-files";
import { createPerson, deletePerson } from "../leads/people";
import { liveEnrolment } from "../plans/enrolment";
import { seedPlans } from "../plans/seed";
import { draftFor, followUpQueue, sprintSent } from "../sprint";
import { saveConnection } from "./google";
import {
  messageText,
  parseLinkedInEmail,
  profileSlugs,
  recentLinkedInEmails,
  syncLinkedInEmails,
  type MailIn,
} from "./linkedin-mail";

const NOW = new Date("2026-11-18T06:30:00Z");

let t: Awaited<ReturnType<typeof createTestDb>>;
let rep: Actor;
let other: Actor;
let admin: string;

beforeEach(async () => {
  t = await createTestDb();
  admin = (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id;
  rep = { id: (await insertTestUser(t.db, { name: "Asha Rao" })).id, role: "User", active: true };
  other = { id: (await insertTestUser(t.db, { name: "Ravi" })).id, role: "User", active: true };
  await seedPlans(t.db, admin);
  await seedKnowledge(t.db, readSeedKnowledge());
  vi.stubEnv("AI_FAKE", "1");
  vi.stubEnv("DATABASE_URL", "file:test.db");
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-google-tokens-0123456789");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  t.cleanup();
});

const lead = (actor: Actor, name: string, slug: string) =>
  createPerson(
    t.db,
    actor,
    personSchema.parse({
      fullName: name,
      linkedinUrl: `https://www.linkedin.com/in/${slug}/`,
      companyName: `${name} Co`,
      stage: "Prospect",
    }),
  );

const connect = (scope: string) =>
  saveConnection(t.db, rep, { email: "asha@gmail.com", refreshToken: "refresh-secret", scope });
const GMAIL =
  "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly";

type FakeMail = {
  id: string;
  from: string;
  subject: string;
  at: Date;
  text?: string;
  html?: string;
};

/** Gmail with these emails in it (newest first, as Gmail lists them). */
function fakeGmail(mails: FakeMail[], opts: { apiOff?: boolean } = {}) {
  const urls: string[] = [];
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return json({ access_token: "access-1", expires_in: 3600 });
      }
      if (opts.apiOff) {
        return json(
          {
            error: {
              message: "Gmail API has not been used in project 1 before or it is disabled.",
              details: [{ reason: "SERVICE_DISABLED" }],
            },
          },
          403,
        );
      }
      const list = url.match(/\/users\/me\/messages\?/);
      if (list) {
        const sorted = [...mails].sort((a, b) => b.at.getTime() - a.at.getTime());
        return json({ messages: sorted.map((m) => ({ id: m.id, threadId: m.id })) });
      }
      const one = url.match(/\/users\/me\/messages\/([^?]+)\?format=full/);
      const m = one && mails.find((x) => x.id === decodeURIComponent(one[1]));
      if (m) {
        return json({
          id: m.id,
          internalDate: String(m.at.getTime()),
          payload: {
            mimeType: "multipart/alternative",
            headers: [
              { name: "From", value: m.from },
              { name: "Subject", value: m.subject },
            ],
            parts: [
              ...(m.text ? [{ mimeType: "text/plain", body: { data: b64(m.text) } }] : []),
              ...(m.html ? [{ mimeType: "text/html", body: { data: b64(m.html) } }] : []),
            ],
          },
        });
      }
      return json({}, 404);
    }),
  );
  return urls;
}

const accepted = (id: string, name: string, slug: string, at: Date): FakeMail => ({
  id,
  from: "LinkedIn <invitations@linkedin.com>",
  subject: `${name} accepted your invitation`,
  at,
  text: [
    `${name} accepted your invitation`,
    "",
    `${name}`,
    "Head of Research at Acme",
    `View ${name.split(" ")[0]}'s profile: https://www.linkedin.com/comm/in/${slug}?midToken=AQ123&trk=eml`,
    "",
    "Start a conversation with your new connection",
    "https://www.linkedin.com/comm/messaging/compose?recipient=x",
    "",
    "This email was intended for Asha Rao (Founder at Lumor)",
  ].join("\n"),
});

const message = (id: string, name: string, slug: string, at: Date, words: string): FakeMail => ({
  id,
  from: `${name} via LinkedIn <messages-noreply@linkedin.com>`,
  subject: `${name} sent you a new message`,
  at,
  text: [
    `${name}`,
    "Head of Research at Acme",
    `https://www.linkedin.com/comm/in/${slug}`,
    "",
    words,
    "",
    "Reply",
    "https://www.linkedin.com/comm/messaging/thread/2-abc",
    "",
    "Unsubscribe: https://www.linkedin.com/comm/psettings/email-unsubscribe",
  ].join("\n"),
});

const mail = (m: Partial<MailIn>): MailIn => ({
  id: "m",
  from: "LinkedIn <invitations@linkedin.com>",
  subject: "",
  date: NOW,
  text: "",
  ...m,
});

describe("reading LinkedIn's emails (D-066)", () => {
  it("reads acceptances, messages, InMail replies; skips digests and other senders", () => {
    expect(
      parseLinkedInEmail(
        mail({
          subject: "Neha Sharma accepted your invitation",
          text: "https://www.linkedin.com/comm/in/neha-sharma-1a2b?midToken=x",
        }),
      ),
    ).toEqual({ kind: "Accepted", name: "Neha Sharma", slugs: ["neha-sharma-1a2b"], text: null });
    expect(
      parseLinkedInEmail(mail({ subject: "Asha, Neha Sharma has accepted your invitation" })).name,
    ).toBe("Neha Sharma");

    const msg = message(
      "x",
      "Omar Khan",
      "omar-khan",
      NOW,
      "Thanks Asha!\nHappy to chat next week.",
    );
    const parsed = parseLinkedInEmail({ ...msg, date: NOW, text: msg.text! });
    expect(parsed).toEqual({
      kind: "Message",
      name: "Omar Khan",
      slugs: ["omar-khan"],
      text: "Thanks Asha!\nHappy to chat next week.",
    });
    expect(
      parseLinkedInEmail(
        mail({
          from: "LinkedIn <inmail-hit-reply@linkedin.com>",
          subject: "New message from Lina Park",
          text: "Sounds good, send me a time.",
        }),
      ),
    ).toMatchObject({ kind: "Message", name: "Lina Park", text: "Sounds good, send me a time." });

    expect(
      parseLinkedInEmail(
        mail({
          from: "LinkedIn <messaging-digest-noreply@linkedin.com>",
          subject: "You have 3 new messages",
        }),
      ).kind,
    ).toBe("Other");
    expect(
      parseLinkedInEmail(
        mail({
          from: "LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>",
          subject: "10 new jobs",
        }),
      ).kind,
    ).toBe("Other");
    expect(
      parseLinkedInEmail(
        mail({
          from: "Phisher <x@linkedin.com.evil.io>",
          subject: "Neha accepted your invitation",
        }),
      ).kind,
    ).toBe("Other");
  });

  it("finds profile links and the message text", () => {
    expect(
      profileSlugs(
        "a https://www.linkedin.com/comm/in/Priya-S%C3%A9n?x=1 b linkedin.com/in/raj-k/ c",
      ),
    ).toEqual(["priya-sén", "raj-k"]);
    expect(messageText("Hello there, quick question about pricing.\n\nReply", null)).toBe(
      "Hello there, quick question about pricing.",
    );
  });
});

describe("Gmail check (D-066)", () => {
  it("logs an acceptance through the plan and a reply with its text, each email once", async () => {
    await connect(GMAIL);
    const neha = await lead(rep, "Neha Sharma", "neha-sharma-1a2b");
    await sprintSent(
      t.db,
      rep,
      neha.id,
      { kind: "connect", text: "Hi Neha, glad to connect." },
      new Date("2026-11-14T06:30:00Z"),
    );
    const omar = await lead(rep, "Omar Khan", "omar-khan");
    const urls = fakeGmail([
      accepted("g1", "Neha Sharma", "neha-sharma-1a2b", new Date("2026-11-16T05:00:00Z")),
      message(
        "g2",
        "Omar Khan",
        "omar-khan",
        new Date("2026-11-17T09:00:00Z"),
        "Thanks Asha, tell me more.",
      ),
      {
        id: "g3",
        from: "LinkedIn <messaging-digest-noreply@linkedin.com>",
        subject: "You have 2 new messages",
        at: new Date("2026-11-17T10:00:00Z"),
        text: "…",
      },
      accepted("g4", "Zara Unknown", "zara-unknown", new Date("2026-11-17T11:00:00Z")),
    ]);

    const r = await syncLinkedInEmails(t.db, rep, NOW);
    expect(r).toEqual({ ok: true, read: 4, accepted: 1, replies: 1, notMatched: 1 });
    // Only LinkedIn's emails about invitations and messages, from the last 7 days.
    const q = decodeURIComponent(urls.find((u) => u.includes("/messages?"))!);
    expect(q).toContain("from:linkedin.com");
    expect(q).toContain(`after:${Math.floor((NOW.getTime() - 7 * 24 * 3600_000) / 1000)}`);

    // Neha: accepted on the day of the email; the plan moved past the request.
    const e = await liveEnrolment(t.db, neha.id);
    expect(e).toMatchObject({ waitingForAcceptance: false, acceptedDate: "2026-11-16" });
    const [acc] = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, neha.id), eq(activity.type, "Request accepted")));
    expect(acc.occurredAt).toEqual(new Date("2026-11-16T05:00:00Z"));

    // Omar: the reply, with its words, and Respond as the follow-up.
    const [reply] = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, omar.id), eq(activity.type, "Reply received")));
    expect(reply).toMatchObject({
      content: "Thanks Asha, tell me more.",
      channel: "LinkedIn",
      direction: "in",
    });
    const [o] = await t.db.select().from(person).where(eq(person.id, omar.id));
    expect(o).toMatchObject({ stage: "Replied", nextAction: "Respond" });

    // The follow-up sprint offers to answer Omar's reply.
    const { cards } = await followUpQueue(t.db, rep, NOW);
    expect(cards.find((c) => c.personId === omar.id)).toMatchObject({
      kind: "reply",
      label: "Answer the reply",
      theySaid: "Thanks Asha, tell me more.",
    });
    await draftFor(t.db, rep, omar.id, "reply", "LinkedIn message");

    // What the panel shows, newest first.
    const rows = await recentLinkedInEmails(t.db, rep.id);
    expect(rows.map((x) => [x.result, x.personName ?? x.fromName])).toEqual([
      ["Not matched", "Zara Unknown"],
      ["Skipped", null],
      ["Logged", "Omar Khan"],
      ["Logged", "Neha Sharma"],
    ]);
    const audits = await t.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityType, "LinkedIn email"));
    expect(audits).toHaveLength(4);

    // A second check reads nothing again; the overlap day is asked for, but nothing is relogged.
    const again = await syncLinkedInEmails(t.db, rep, new Date(NOW.getTime() + 15 * 60_000));
    expect(again).toEqual({ ok: true, read: 0, accepted: 0, replies: 0, notMatched: 0 });
    expect(await t.db.select().from(linkedinEmail)).toHaveLength(4);

    // Deleting a person keeps the email read, unlinked, and takes their desk drafts with them.
    expect(
      (await t.db.select().from(deskEntry).where(eq(deskEntry.personId, omar.id))).length,
    ).toBeGreaterThan(0);
    await deletePerson(t.db, { id: admin, role: "Admin", active: true }, omar.id);
    const kept = await t.db.select().from(linkedinEmail).where(eq(linkedinEmail.gmailId, "g2"));
    expect(kept[0].personId).toBeNull();
  });

  it("doesn't log twice what the rep already logged, and matches by unique full name", async () => {
    await connect(GMAIL);
    // No profile link that matches: found by the full name.
    const lina = await lead(rep, "Lina Park", "lina-park-99");
    fakeGmail([
      {
        id: "h1",
        from: "Lina Park <messages-noreply@linkedin.com>",
        subject: "Lina Park sent you a new message",
        at: new Date("2026-11-17T09:00:00Z"),
        html: '<p>Lina Park</p><p>Sounds good, send me a time.</p><p><a href="https://www.linkedin.com/comm/messaging/thread/1">Reply</a></p>',
      },
      {
        id: "h2",
        from: "Lina Park <messages-noreply@linkedin.com>",
        subject: "Lina Park sent you a new message",
        at: new Date("2026-11-17T09:05:00Z"),
        text: "Lina Park\n\nSounds good, send me a time.\n\nReply",
      },
    ]);
    const r = await syncLinkedInEmails(t.db, rep, NOW);
    expect(r).toMatchObject({ ok: true, read: 2, replies: 1 });
    const replies = await t.db
      .select()
      .from(activity)
      .where(and(eq(activity.personId, lina.id), eq(activity.type, "Reply received")));
    expect(replies.map((x) => x.content)).toEqual(["Sounds good, send me a time."]);
    expect((await recentLinkedInEmails(t.db, rep.id)).map((x) => x.result)).toEqual([
      "Already logged",
      "Logged",
    ]);
  });

  it("only changes the rep's own people", async () => {
    await connect(GMAIL);
    const theirs = await lead(other, "Neha Sharma", "neha-sharma-1a2b");
    fakeGmail([
      accepted("k1", "Neha Sharma", "neha-sharma-1a2b", new Date("2026-11-17T05:00:00Z")),
    ]);
    const r = await syncLinkedInEmails(t.db, rep, NOW);
    expect(r).toMatchObject({ ok: true, read: 1, accepted: 0, notMatched: 1 });
    expect(
      await t.db
        .select()
        .from(activity)
        .where(and(eq(activity.personId, theirs.id), eq(activity.type, "Request accepted"))),
    ).toHaveLength(0);
  });

  it("reads nothing without the Gmail permission, and says what to fix", async () => {
    const urls = fakeGmail([]);
    expect(await syncLinkedInEmails(t.db, rep, NOW)).toEqual({
      ok: false,
      problem: "Gmail isn't connected. Click Connect Gmail.",
    });
    await connect("https://www.googleapis.com/auth/calendar.events");
    expect((await syncLinkedInEmails(t.db, rep, NOW)).ok).toBe(false);
    expect(urls.some((u) => u.includes("gmail.googleapis.com"))).toBe(false);

    await connect(GMAIL);
    fakeGmail([], { apiOff: true });
    const off = await syncLinkedInEmails(t.db, rep, NOW);
    expect(off.ok === false && off.problem).toContain("Gmail API is switched off");
  });
});
