// GET /ai-resources/files/{id} → an uploaded sales resource, for signed-in users only (F20).
// Images, PDFs and videos open in the browser; ?download=1 saves the file instead.
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { getViewer } from "@/lib/session";
import { resourceFile } from "@/server/sales-resources";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Please log in.", { status: 401 });
  if (!viewer.active || viewer.mustChangePassword || !can(viewer, "record.view")) {
    return new Response("Not allowed", { status: 403 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const file = await resourceFile(getDb(), id);
  if (!file) return new Response("Not found", { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  const name = encodeURIComponent(file.fileName ?? "file");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType ?? "application/octet-stream",
      "Content-Length": String(file.data.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
