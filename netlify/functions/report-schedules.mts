// Netlify scheduled function (F19, D-039; reminders D-043): every 15 minutes it asks the app to
// run the report schedules that are due and to send the booking reminders that are due. The app
// does the work and checks CRON_SECRET; nothing else lives here.
export default async function scheduledJobs(): Promise<Response> {
  const base = process.env.URL ?? process.env.BETTER_AUTH_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    console.error("Scheduled jobs: the site URL or CRON_SECRET isn't set.");
    return new Response("Not set up", { status: 500 });
  }
  let ok = true;
  for (const job of ["reports", "reminders"]) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/cron/${job}`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
      });
      console.log(`Scheduled ${job}: ${res.status} ${await res.text()}`);
      ok &&= res.ok;
    } catch (e) {
      console.error(`Scheduled ${job} failed:`, e instanceof Error ? e.message : e);
      ok = false;
    }
  }
  return new Response(null, { status: ok ? 200 : 502 });
}

export const config = { schedule: "*/15 * * * *" };
