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
import { reportRequestSchema, scheduleSchema } from "@/lib/validation/reports";
import { AiError } from "../ai/client";
import { LeadError } from "../leads/companies";
import {
  createSchedule,
  deleteSchedule,
  runScheduleNow,
  setScheduleActive,
  updateSchedule,
} from "../report-schedules";
import { createReport, writeAiSummary, type ReportTarget } from "../reports";

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
    const row = await createReport(getDb(), viewer, target, span, { now });
    refresh();
    return { ok: true, message: "Report saved.", link: `/reports/${row.id}` };
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
