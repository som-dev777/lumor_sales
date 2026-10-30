// Netlify scheduled function (F19, D-039): every 15 minutes it asks the app to run the report
// schedules that are due. The app does the work and checks CRON_SECRET; nothing else lives here.
export default async function reportSchedules(): Promise<Response> {
  const base = process.env.URL ?? process.env.BETTER_AUTH_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("Report schedules: the site URL or CRON_SECRET isn't set.");
    return new Response("Not set up", { status: 500 });
  }
  const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/reports`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  console.log(`Report schedules: ${res.status} ${await res.text()}`);
  return new Response(null, { status: res.ok ? 200 : 502 });
}

export const config = { schedule: "*/15 * * * *" };
