// GET /reports/{id}/pdf → a saved report as a PDF file with charts (F19 round 2, D-043). Same
// rule as the page: Admins open any report; others their own and the ones sent to them.
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/session";
import { reportPdf } from "@/server/report-pdf";
import { getReport } from "@/server/reports";

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
  const name = `lumor-report-${run.fromDate}-to-${run.toDate}.pdf`;
  return new Response(new Uint8Array(reportPdf(run.data, run.aiSummary)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
