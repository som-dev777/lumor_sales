// Choices for the person and company forms (active items only; archived ones are hidden).
import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { accountFilter, company, persona, template } from "@/lib/db/schema";
import { activeOwners } from "./companies";

export type Choice = { id: string; label: string };
export type LeadFormOptions = {
  personas: Choice[];
  accountFilters: Choice[];
  templates: Choice[];
  owners: Choice[];
  companies: string[];
};

export async function leadFormOptions(db: DbOrTx): Promise<LeadFormOptions> {
  const [personas, filters, templates, owners, companies] = await Promise.all([
    db
      .select({ id: persona.id, name: persona.name, type: persona.type })
      .from(persona)
      .where(eq(persona.status, "Active"))
      .orderBy(asc(persona.name)),
    db
      .select({
        id: accountFilter.id,
        code: accountFilter.code,
        name: accountFilter.name,
        type: accountFilter.type,
      })
      .from(accountFilter)
      .where(eq(accountFilter.status, "Active"))
      .orderBy(asc(accountFilter.code)),
    db
      .select({
        id: template.id,
        name: template.name,
        version: template.version,
        type: template.type,
      })
      .from(template)
      .where(eq(template.status, "Active"))
      .orderBy(asc(template.purpose), asc(template.name)),
    activeOwners(db),
    db.select({ name: company.name }).from(company).orderBy(asc(company.name)),
  ]);
  const personal = (type: string) => (type === "Personal" ? " (Personal)" : "");
  return {
    personas: personas.map((p) => ({ id: p.id, label: p.name + personal(p.type) })),
    accountFilters: filters.map((f) => ({
      id: f.id,
      label: `${f.code} ${f.name}${personal(f.type)}`,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      label: `${t.name} (${t.version})${personal(t.type)}`,
    })),
    owners: owners.map((o) => ({ id: o.id, label: o.name })),
    companies: companies.map((c) => c.name),
  };
}
