"use server";

// Server Actions for Reports (F19). Each one: requireUser() → the permission check, the change
// and its audit entry in one transaction (src/server/reports.ts, report-schedules.ts) → refresh.
import { refresh } from "next/cache";
import { z } from "zod";
import { errorMessage, fieldErrorsFrom, type ActionResult } from "@/lib/action-result";
import { appNow } from "@/lib/clock";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { presetSpan, type ReportPreset } from "@/lib/report-periods";
import { requireUser } from "@/lib/session";
import { todayIst } from "@/lib/time";
import { emailReportSchema, reportRequestSchema, scheduleSchema } from "@/lib/validation/reports";
import { emailConfigured } from "../email";
import { emailReport } from "../report-share";
import { AiError } from "../ai/client";
import { LeadError } from "../leads/companies";
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  setScheduleActive,
  updateSchedule,
} from "../report-schedules";
import {
  createReport,
  saveReportEdits,
  setSectionIncluded,
  writeAiSummary,
  type ReportTarget,
} from "../reports";

const id = z.uuid();

async function run(work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof LeadError || e instanceof PermissionError || e instanceof AiError) {
      return { ok: false, error: e.message };
    }
    console.error(e);
    return { ok: false, error: errorMessage(e, "Something went wrong. Please try again.") };
  }
}

/** Makes and saves a report, then sends the browser to it. */
export async function generateReport(input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  const parsed = reportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  const r = parsed.data;
  const target: ReportTarget =
    r.who === "team"
      ? { scope: "team" }
      : { scope: "person", userId: r.who === "me" ? viewer.id : r.who };
  if (target.scope === "person" && !id.safeParse(target.userId).success) {
    return { ok: false, error: "Choose who the report is about." };
  }
  return run(async () => {
    const now = await appNow();
    const span = presetSpan(r.preset as ReportPreset, todayIst(now), { from: r.from, to: r.to });
    const db = getDb();
    const row = await createReport(db, viewer, target, span, { now });
    let message = "Report saved.";
    if (r.shareWith.length + r.emails.length > 0) {
      const sent = await emailReport(db, viewer, row.id, {
        userIds: r.shareWith,
        emails: r.emails,
      });
      message = sentMessage(sent);
    }
    refresh();
    return { ok: true, message, link: `/reports/${row.id}` };
  });
}

export async function writeReportSummary(reportId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(reportId).success) return { ok: false, error: "Unknown report." };
  return run(async () => {
    await writeAiSummary(getDb(), viewer, reportId);
    refresh();
    return { ok: true, message: "AI summary added." };
  });
}

export async function saveSchedule(
  scheduleId: string | null,
  input: unknown,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (scheduleId !== null && !id.safeParse(scheduleId).success) {
    return { ok: false, error: "Unknown schedule." };
  }
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  return run(async () => {
    const now = await appNow();
    const row = scheduleId
      ? await updateSchedule(getDb(), viewer, scheduleId, parsed.data, now)
      : await createSchedule(getDb(), viewer, parsed.data, now);
    refresh();
    return { ok: true, message: `${row.name} saved.` };
  });
}

export async function switchSchedule(scheduleId: string, active: boolean): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(scheduleId).success) return { ok: false, error: "Unknown schedule." };
  return run(async () => {
    const row = await setScheduleActive(
      getDb(),
      viewer,
      scheduleId,
      Boolean(active),
      await appNow(),
    );
    refresh();
    return { ok: true, message: `${row.name} switched ${row.active ? "on" : "off"}.` };
  });
}

export async function removeSchedule(scheduleId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(scheduleId).success) return { ok: false, error: "Unknown schedule." };
  return run(async () => {
    await deleteSchedule(getDb(), viewer, scheduleId);
    refresh();
    return { ok: true, message: "Schedule deleted." };
  });
}

export async function runNow(scheduleId: string): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(scheduleId).success) return { ok: false, error: "Unknown schedule." };
  return run(async () => {
    const made = await runScheduleNow(getDb(), viewer, scheduleId, await appNow());
    refresh();
    return {
      ok: true,
      message: `${made.length} ${made.length === 1 ? "report" : "reports"} made. See Report history.`,
    };
  });
}

function sentMessage(r: { sent: string[]; shared: number; addresses: string[] }) {
  const shared = r.shared ? ` Shared with ${r.shared} teammate${r.shared === 1 ? "" : "s"}.` : "";
  if (!emailConfigured())
    return `Report saved.${shared} Email isn't set up, so nothing was emailed.`;
  return `Report saved and emailed to ${r.sent.length} of ${r.addresses.length}.${shared}`;
}

/** Email a saved report again, to teammates and other addresses (D-043). */
export async function emailReportAction(reportId: string, input: unknown): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(reportId).success) return { ok: false, error: "Unknown report." };
  const parsed = emailReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0].message,
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  return run(async () => {
    const r = await emailReport(getDb(), viewer, reportId, {
      userIds: parsed.data.shareWith,
      emails: parsed.data.emails,
    });
    refresh();
    return { ok: true, message: sentMessage(r).replace("Report saved and emailed", "Emailed") };
  });
}

// --- Shaping a saved report (D-057) ----------------------------------------------------------

/** Includes or leaves out one section of a report in its downloads. */
export async function includeReportSection(
  reportId: string,
  section: string,
  included: boolean,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(reportId).success || typeof section !== "string") {
    return { ok: false, error: "Unknown report." };
  }
  return run(async () => {
    await setSectionIncluded(getDb(), viewer, reportId, section, Boolean(included));
    refresh();
    return {
      ok: true,
      message: included ? "Included in the report." : "Left out of the report.",
    };
  });
}

/** Saves edited numbers on a report (the app's data never changes). Empty = undo all edits. */
export async function saveReportNumbers(
  reportId: string,
  edits: Record<string, unknown>,
): Promise<ActionResult> {
  const viewer = await requireUser();
  if (!id.safeParse(reportId).success || typeof edits !== "object" || edits === null) {
    return { ok: false, error: "Unknown report." };
  }
  return run(async () => {
    const kept = await saveReportEdits(getDb(), viewer, reportId, edits);
    refresh();
    return {
      ok: true,
      message: Object.keys(kept).length
        ? "Numbers saved on this report."
        : "Back to the original numbers.",
    };
  });
}
