// Turns record ids inside audit "changes" (owner, company, persona…) into names people can
// read. The audit log itself stays exactly as written (it's insert-only); this only affects
// how it's shown.
import { inArray } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { accountFilter, company, person, persona, template, user } from "@/lib/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Changes = Record<string, { before: unknown; after: unknown }>;

/** Every id-looking value in these changes, mapped to a readable name where one exists. */
export async function auditNameMap(
  db: DbOrTx,
  changesList: Changes[],
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const changes of changesList) {
    for (const { before, after } of Object.values(changes)) {
      for (const v of [before, after]) if (typeof v === "string" && UUID.test(v)) ids.add(v);
    }
  }
  if (ids.size === 0) return {};
  const list = [...ids];
  const [users, companies, personas, filters, templates, people] = await Promise.all([
    db.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, list)),
    db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(inArray(company.id, list)),
    db
      .select({ id: persona.id, name: persona.name })
      .from(persona)
      .where(inArray(persona.id, list)),
    db
      .select({ id: accountFilter.id, code: accountFilter.code, name: accountFilter.name })
      .from(accountFilter)
      .where(inArray(accountFilter.id, list)),
    db
      .select({ id: template.id, name: template.name })
      .from(template)
      .where(inArray(template.id, list)),
    db
      .select({ id: person.id, name: person.fullName })
      .from(person)
      .where(inArray(person.id, list)),
  ]);
  const map: Record<string, string> = {};
  for (const r of [...users, ...companies, ...personas, ...templates, ...people])
    map[r.id] = r.name;
  for (const f of filters) map[f.id] = `${f.code} ${f.name}`;
  return map;
}
