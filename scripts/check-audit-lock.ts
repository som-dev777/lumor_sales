// `npm run audit:check-lock`: proves the Audit Log can't be changed, by trying to edit and
// delete entries directly in the database (bypassing the app entirely). Both attempts must
// be refused by the database triggers. Nothing is changed either way.
import { createDb } from "../src/lib/db/client";
import { loadEnv, requireEnv } from "./_env";

async function attempt(label: string, run: () => Promise<unknown>) {
  try {
    await run();
    console.log(`  ✗ ${label}: the database ALLOWED it. The lock is missing!`);
    return false;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.log(
      `  ✓ ${label}: refused ("${message.match(/audit_log is insert-only/)?.[0] ?? message}")`,
    );
    return true;
  }
}

async function main() {
  loadEnv();
  const { client } = createDb(requireEnv("DATABASE_URL"), process.env.DATABASE_AUTH_TOKEN);
  const { rows } = await client.execute("SELECT count(*) AS n FROM audit_log");
  const n = Number(rows[0].n);
  if (n === 0) {
    console.log(
      "The Audit Log is empty, so there's nothing to try to change yet. Do something in the app first.",
    );
    client.close();
    return;
  }

  console.log(`The Audit Log has ${n} entries. Trying to change them directly in the database…`);
  const edit = await attempt("Edit an entry", () =>
    client.execute(
      "UPDATE audit_log SET record_name = 'tampered' WHERE id = (SELECT id FROM audit_log LIMIT 1)",
    ),
  );
  const del = await attempt("Delete all entries", () => client.execute("DELETE FROM audit_log"));
  const after = Number((await client.execute("SELECT count(*) AS n FROM audit_log")).rows[0].n);
  console.log(`Entries now: ${after} (unchanged: ${after === n ? "yes" : "NO"}).`);
  client.close();
  if (!edit || !del || after !== n) process.exit(1);
}

main().catch((e) => {
  console.error("Check failed:", e);
  process.exit(1);
});
