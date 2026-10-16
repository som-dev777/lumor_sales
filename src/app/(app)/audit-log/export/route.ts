// GET /audit-log/export?…filters → the matching Audit Log entries as a CSV file (F14).
// Admin only, checked here on the server with the shared permission check.
import { summariseChanges } from "@/lib/audit-format";
import { toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/session";
import { formatIst, todayIst } from "@/lib/time";
import { allMatchingEntries, parseAuditFilters } from "@/server/audit-query";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Please log in.", { status: 401 });
  if (!viewer.active || viewer.mustChangePassword || !can(viewer, "audit.view")) {
    return new Response("Not allowed", { status: 403 });
  }

  const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
  const entries = await allMatchingEntries(getDb(), filters);
  const csv = toCsv(
    ["When (IST)", "Who", "Action", "Type", "Record", "Record ID", "Changes", "Changes (JSON)"],
    entries.map((e) => [
      formatIst(e.occurredAt),
      e.userName ?? "System",
      e.action,
      e.entityType,
      e.recordName,
      e.recordId,
      summariseChanges(e.changes),
      JSON.stringify(e.changes),
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${todayIst()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
