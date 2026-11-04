// F19 round 2 (D-043): the Pipeline section, emailing and sharing a report, Shared with me,
// and the PDF made on the server.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activity, company, notification, person, reportRun } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import type { Actor } from "@/lib/permissions";
import { emailReportSchema, reportRequestSchema } from "@/lib/validation/reports";
import { personSchema } from "@/lib/validation/leads";
import type { Email } from "./email";
import { createPerson } from "./leads/people";
import { pdfText, reportPdf } from "./report-pdf";
import { emailReport } from "./report-share";
import { buildReport, createReport, getReport, listReports, type ReportData } from "./reports";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor & { name: string };
let asha: Actor & { name: string };
let ravi: Actor & { name: string };
const OCT = { from: "2026-10-01", to: "2026-10-31" };
const on = (date: string) => new Date(`${date}T06:30:00Z`);

beforeEach(async () => {
  t = await createTestDb();
  const a = await insertTestUser(t.db, {
    name: "Somnath",
    role: "Admin",
    email: "somnath@lumor.tech",
  });
  const r1 = await insertTestUser(t.db, { name: "Asha", email: "asha@lumor.tech" });
  const r2 = await insertTestUser(t.db, { name: "Ravi", email: "ravi@lumor.tech" });
  admin = { id: a.id, role: "Admin", active: true, name: "Somnath" };
  asha = { id: r1.id, role: "User", active: true, name: "Asha" };
  ravi = { id: r2.id, role: "User", active: true, name: "Ravi" };
});
afterEach(() => {
  vi.unstubAllEnvs();
  t.cleanup();
});

let n = 0;
async function lead(owner: Actor, createdAt: Date, stage = "Contacted") {
  n += 1;
  const p = await createPerson(
    t.db,
    owner,
    personSchema.parse({
      fullName: `Lead ${n}`,
      linkedinUrl: `linkedin.com/in/r2-${n}`,
      companyName: `Company ${n}`,
      stage,
    }),
  );
  await t.db.update(person).set({ createdAt }).where(eq(person.id, p.id));
  await t.db.update(company).set({ createdAt }).where(eq(company.id, p.companyId!));
  return p;
}
const touch = (by: Actor, personId: string, type: "Request sent" | "Reply received", at: Date) =>
  t.db.insert(activity).values({ personId, userId: by.id, occurredAt: at, type });

describe("the Pipeline section (D-043)", () => {
  it("people and companies added, new outreach, replied, no response, and stages, per rep", async () => {
    const a1 = await lead(asha, on("2026-10-05"));
    const a2 = await lead(asha, on("2026-10-06"));
    const old = await lead(asha, on("2026-09-01"));
    await lead(ravi, on("2026-10-07"), "Replied");
    await touch(asha, a1.id, "Request sent", on("2026-10-05"));
    await touch(asha, a1.id, "Reply received", on("2026-10-08"));
    await touch(asha, a2.id, "Request sent", on("2026-10-06"));
    // First contacted in September: not new outreach in October, but its reply counts.
    await touch(asha, old.id, "Request sent", on("2026-09-02"));
    await touch(asha, old.id, "Reply received", on("2026-10-10"));

    const r = await buildReport(t.db, { scope: "team" }, OCT);
    expect(r.version).toBe(3);
    const row = r.pipeline!.people.find((x) => x.name === "Asha")!;
    expect(row).toMatchObject({
      peopleAdded: 2,
      companiesAdded: 2,
      newOutreach: 2,
      replied: 2,
      noResponse: 1,
      stages: { Contacted: 3 },
    });
    // Ravi added a person in October: that counts as new outreach, as on Today (D-057).
    expect(r.pipeline!.total).toMatchObject({ peopleAdded: 3, newOutreach: 3, noResponse: 2 });
    expect(r.pipeline!.total.stages).toEqual({ Contacted: 3, Replied: 1 });
  });
});

describe("emailing and sharing a report (D-043)", () => {
  function emailOn() {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Lumor <hub@lumor.tech>");
    vi.stubEnv("BETTER_AUTH_URL", "https://hub.example");
  }
  const sent: Email[] = [];
  const send = async (e: Email) => {
    sent.push(e);
    return true;
  };

  it("the form takes teammates and addresses; bad addresses are refused", () => {
    const ok = reportRequestSchema.parse({
      who: "me",
      preset: "week",
      shareWith: [ravi.id],
      emails: "Boss@Client.com; boss@client.com, cfo@client.in",
    });
    expect(ok.emails).toEqual(["boss@client.com", "cfo@client.in"]);
    expect(emailReportSchema.safeParse({ emails: "not-an-email" }).success).toBe(false);
    expect(emailReportSchema.safeParse({ emails: "" }).success).toBe(false);
  });

  it("sends the PDF to everyone, shares with teammates (notified), and they can open it", async () => {
    emailOn();
    sent.length = 0;
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, OCT);
    expect(await getReport(t.db, ravi, run.id)).toBeNull();
    const r = await emailReport(
      t.db,
      asha,
      run.id,
      { userIds: [ravi.id], emails: ["boss@client.com", "SOMNATH@lumor.tech"] },
      send,
    );
    expect(r.sent.sort()).toEqual(["boss@client.com", "ravi@lumor.tech", "somnath@lumor.tech"]);
    expect(sent[0].attachments![0]).toMatchObject({ contentType: "application/pdf" });
    expect(sent[0].text).toContain("Asha sent you this report.");
    // Ravi (ticked) and Somnath (typed his login email) can open it now.
    expect((await getReport(t.db, ravi, run.id))?.id).toBe(run.id);
    expect((await listReports(t.db, ravi, "shared")).map((x) => x.id)).toEqual([run.id]);
    expect((await listReports(t.db, asha, "mine")).map((x) => x.id)).toEqual([run.id]);
    const notes = await t.db.select().from(notification);
    expect(notes.map((x) => x.userId).sort()).toEqual([admin.id, ravi.id].sort());
    expect(notes[0]).toMatchObject({ kind: "report", link: `/reports/${run.id}` });
    const [saved] = await t.db.select().from(reportRun).where(eq(reportRun.id, run.id));
    expect(saved.sharedWith.sort()).toEqual([admin.id, ravi.id].sort());
    // Someone who can't open a report can't send it.
    const other = await createReport(t.db, admin, { scope: "team" }, OCT);
    await expect(
      emailReport(t.db, ravi, other.id, { userIds: [], emails: ["x@y.com"] }, send),
    ).rejects.toThrow("That report doesn't exist.");
  });

  it("without email set up, it still shares with teammates", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    sent.length = 0;
    const run = await createReport(t.db, asha, { scope: "person", userId: asha.id }, OCT);
    const r = await emailReport(t.db, asha, run.id, { userIds: [ravi.id], emails: [] }, send);
    expect(r).toMatchObject({ sent: [], shared: 1 });
    expect(sent).toHaveLength(0);
    expect((await getReport(t.db, ravi, run.id))?.id).toBe(run.id);
  });
});

describe("the PDF (D-043)", () => {
  it("is a real PDF with charts and tables, for new and older saved reports", async () => {
    await lead(asha, on("2026-10-05"));
    const data = await buildReport(t.db, { scope: "team" }, OCT);
    const pdf = reportPdf(data, "Asha led the week.");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
    // A report saved before 2.7.0 has no Pipeline section; it still makes a PDF.
    const { pipeline: _p, ...older } = data;
    expect(
      reportPdf({ ...older, version: 1 } as ReportData, null)
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    expect(pdfText("Deal ₹ 5,000 → Paid – “ok”")).toBe('Deal INR  5,000 -> Paid - "ok"');
  });
});
