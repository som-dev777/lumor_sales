// GET /reports/{id}/csv → a saved report as one CSV file (F19). Same rule as the page: Admins
// open any report; Users only their own.
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/session";
import { getReport, reportCsv, shapeOf } from "@/server/reports";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Please log in.", { status: 401 });
  if (!viewer.active || viewer.mustChangePassword || !can(viewer, "record.view")) {
    return new Response("Not allowed", { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const run = await getReport(getDb(), viewer, id);
  if (!run) return new Response("Not found", { status: 404 });
  const name = `lumor-report-${run.fromDate}-to-${run.toDate}.csv`;
  return new Response(reportCsv(shapeOf(run).data, run.aiSummary, shapeOf(run).hidden), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
