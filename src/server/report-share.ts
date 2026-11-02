// Sending a report (F19 round 2, D-043): to teammates and any email addresses, with the PDF
// attached and a link. Teammates it's sent to can open it (Shared with me) and get a
// notification. Used by Make a report, Email this report and the scheduled reports.
import { and, eq, inArray, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db } from "@/lib/db/client";
import { reportRun, user } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import { appUrl } from "@/lib/tokens";
import { renderMail } from "./calendar-mail";
import { emailConfigured, sendEmail, type Email } from "./email";
import { LeadError } from "./leads/companies";
import { addNotificationsTx } from "./notifications";
import { reportPdf } from "./report-pdf";
import { getReport, type ReportData } from "./reports";

export const MAX_REPORT_RECIPIENTS = 20;

/** The report email: headline numbers, the AI summary, a link, and the PDF attached. */
export function reportMail(
  to: string,
  runId: string,
  data: ReportData,
  summary: string | null,
  by: string | null,
): Email {
  const t = data.total;
  const p = data.pipeline?.total;
  const { text, html } = renderMail({
    heading: `Report: ${data.title}`,
    intro: by
      ? `${by} sent you this report. The PDF is attached.`
      : "Your scheduled report. The PDF is attached.",
    rows: [
      ...(p
        ? ([
            ["People added", String(p.peopleAdded)],
            ["Companies added", String(p.companiesAdded)],
            ["New outreach", String(p.newOutreach)],
            ["Replied", String(p.replied)],
            ["No response yet", String(p.noResponse)],
          ] as [string, string][])
        : []),
      ["Connection requests", String(t.requests)],
      ["Messages and emails", String(t.messages + t.emails)],
      ["Calls", String(t.calls)],
      ["Meetings booked", String(t.meetingsBooked)],
      ["Conversions", String(t.conversions)],
      ["Plan steps", `${t.stepsDone} done, ${t.stepsLate} late`],
    ],
    after: summary ? [summary] : [],
    button: { label: "Open the full report", url: `${appUrl()}/reports/${runId}` },
    foot: "Opening the report needs a Sales Hub login.",
  });
  return { to, subject: `Report: ${data.title}`, text, html };
}

type Run = typeof reportRun.$inferSelect;

/**
 * Sends a saved report to teammates (by id) and other addresses, and shares it with every
 * teammate among them. `actor` is empty for a schedule. Returns who it was emailed to.
 */
export async function emailReport(
  db: Db,
  actor: (Actor & { name?: string }) | null,
  runId: string,
  to: { userIds: string[]; emails: string[] },
  send: (e: Email) => Promise<boolean> = sendEmail,
) {
  let run: Run & { data: ReportData };
  if (actor) {
    const found = await getReport(db, actor, runId);
    if (!found) throw new LeadError("That report doesn't exist.");
    run = found;
  } else {
    const [row] = await db.select().from(reportRun).where(eq(reportRun.id, runId));
    if (!row) throw new LeadError("That report doesn't exist.");
    run = { ...row, data: row.data as ReportData };
  }
  const extra = [...new Set(to.emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.userIds.length + extra.length === 0) throw new LeadError("Choose who to send it to.");
  if (to.userIds.length + extra.length > MAX_REPORT_RECIPIENTS) {
    throw new LeadError(`Send it to at most ${MAX_REPORT_RECIPIENTS} people at a time.`);
  }
  // Teammates: the ones ticked, and anyone whose login email was typed in.
  const mates = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        eq(user.active, true),
        sql`(${to.userIds.length ? inArray(user.id, to.userIds) : sql`0`} or ${
          extra.length ? inArray(sql`lower(${user.email})`, extra) : sql`0`
        })`,
      ),
    );
  const addresses = [...new Set([...mates.map((m) => m.email.toLowerCase()), ...extra])];
  const sent: string[] = [];
  if (emailConfigured()) {
    const pdf = reportPdf(run.data, run.aiSummary);
    const filename = `${run.title.replace(/[^\w\- ]+/g, "").trim() || "report"}.pdf`;
    for (const address of addresses) {
      const mail = reportMail(address, run.id, run.data, run.aiSummary, actor?.name ?? null);
      const ok = await send({
        ...mail,
        attachments: [{ filename, content: pdf, contentType: "application/pdf" }],
      });
      if (ok) sent.push(address);
    }
  }
  const shareWith = mates.map((m) => m.id).filter((id) => id !== run.generatedBy);
  await db.transaction(async (tx) => {
    const emailedTo = [...new Set([...run.emailedTo, ...sent])];
    const sharedWith = [...new Set([...run.sharedWith, ...shareWith])];
    await tx.update(reportRun).set({ emailedTo, sharedWith }).where(eq(reportRun.id, run.id));
    await writeAudit(tx, {
      userId: actor?.id ?? null,
      entityType: "Report",
      recordId: run.id,
      recordName: run.title,
      action: "Updated",
      before: { emailedTo: run.emailedTo, sharedWith: run.sharedWith },
      after: { emailedTo, sharedWith },
    });
    await addNotificationsTx(
      tx,
      actor?.id ?? null,
      shareWith
        .filter((id) => id !== actor?.id && !run.sharedWith.includes(id))
        .map((userId) => ({
          userId,
          kind: "report" as const,
          title: `Report: ${run.title}`,
          body: actor?.name
            ? `${actor.name} sent you this report.`
            : "A scheduled report was sent to you.",
          link: `/reports/${run.id}`,
        })),
    );
  });
  return { sent, shared: shareWith.length, addresses };
}
