// GET /people/export?…filters → the filtered People view as a CSV file (F02).
import { toCsv } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/session";
import { todayIst } from "@/lib/time";
import { parsePeopleFilters, peopleForExport } from "@/server/leads/people";

export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Please log in.", { status: 401 });
  if (!viewer.active || viewer.mustChangePassword || !can(viewer, "record.view")) {
    return new Response("Not allowed", { status: 403 });
  }
  const filters = parsePeopleFilters(Object.fromEntries(new URL(request.url).searchParams), viewer);
  const rows = await peopleForExport(getDb(), filters);
  const csv = toCsv(
    [
      "Name",
      "Title",
      "Company",
      "LinkedIn",
      "Sales Navigator",
      "Persona",
      "Level",
      "Account filter",
      "Market",
      "Owner",
      "Stage",
      "Plan",
      "Plan step",
      "Do not contact",
      "Next action",
      "Next action date",
      "Lost reason",
      "Converted",
    ],
    rows.map((r) => [
      r.fullName,
      r.title,
      r.companyName,
      r.linkedinUrl,
      r.salesNavUrl,
      r.personaName,
      r.level,
      r.accountFilterCode,
      r.market,
      r.ownerName,
      r.stage,
      r.planName,
      r.planName ? `${r.planStep} (${r.planStatus})` : "",
      r.doNotContact ? "Yes" : "No",
      r.nextAction,
      r.nextActionDate,
      r.lostReason,
      r.converted ? "Yes" : "No",
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="people-${todayIst()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
