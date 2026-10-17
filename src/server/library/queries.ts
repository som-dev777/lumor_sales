// Reading the library for the Personas, Account Filters and Templates pages.
import { and, asc, desc, eq, getTableColumns, inArray, ne, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { accountFilter, persona, proposal, template, user } from "@/lib/db/schema";
import { KIND_LABEL, type LibraryKind } from "./items";

export type LibraryTab = "official" | "personal";
export type ListOptions = {
  tab: LibraryTab;
  includeArchived: boolean;
  mineOnly: boolean;
  viewerId: string;
};

function conditions(
  table: typeof persona | typeof accountFilter | typeof template,
  o: ListOptions,
): SQL | undefined {
  const parts: SQL[] = [eq(table.type, o.tab === "official" ? "Official" : "Personal")];
  if (!o.includeArchived) parts.push(eq(table.status, "Active"));
  if (o.tab === "personal" && o.mineOnly) parts.push(eq(table.ownerId, o.viewerId));
  return and(...parts);
}

export async function listPersonas(db: DbOrTx, o: ListOptions) {
  return db
    .select({ ...getTableColumns(persona), ownerName: user.name })
    .from(persona)
    .leftJoin(user, eq(user.id, persona.ownerId))
    .where(conditions(persona, o))
    .orderBy(asc(persona.tier), asc(persona.name));
}

export async function listAccountFilters(db: DbOrTx, o: ListOptions) {
  return db
    .select({ ...getTableColumns(accountFilter), ownerName: user.name })
    .from(accountFilter)
    .leftJoin(user, eq(user.id, accountFilter.ownerId))
    .where(conditions(accountFilter, o))
    .orderBy(asc(accountFilter.code), asc(accountFilter.name));
}

export async function listTemplates(db: DbOrTx, o: ListOptions) {
  return db
    .select({ ...getTableColumns(template), ownerName: user.name, personaName: persona.name })
    .from(template)
    .leftJoin(user, eq(user.id, template.ownerId))
    .leftJoin(persona, eq(persona.id, template.personaId))
    .where(conditions(template, o))
    .orderBy(asc(template.purpose), asc(template.name), asc(template.version));
}

/** How many items are on each tab (for the tab labels). */
export async function tabCounts(db: DbOrTx, kind: LibraryKind, o: Omit<ListOptions, "tab">) {
  const list =
    kind === "persona"
      ? listPersonas
      : kind === "accountFilter"
        ? listAccountFilters
        : listTemplates;
  const [official, personal] = await Promise.all([
    list(db, { ...o, tab: "official" }),
    list(db, { ...o, tab: "personal" }),
  ]);
  return { official: official.length, personal: personal.length };
}

/** The latest decided proposal per item (to show "Rejected: <note>" on its card). */
export async function latestDecisions(db: DbOrTx, kind: LibraryKind, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, { decision: string; note: string | null }>();
  const rows = await db
    .select({ itemId: proposal.itemId, decision: proposal.decision, note: proposal.reviewerNote })
    .from(proposal)
    .where(
      and(
        eq(proposal.itemType, KIND_LABEL[kind]),
        inArray(proposal.itemId, itemIds),
        ne(proposal.decision, "Pending"),
      ),
    )
    .orderBy(desc(proposal.decidedAt));
  const out = new Map<string, { decision: string; note: string | null }>();
  for (const r of rows)
    if (!out.has(r.itemId)) out.set(r.itemId, { decision: r.decision, note: r.note });
  return out;
}

/** Active personas, for the template form's persona picker (archived ones are hidden). */
export async function personaChoices(db: DbOrTx) {
  return db
    .select({ id: persona.id, name: persona.name, type: persona.type })
    .from(persona)
    .where(eq(persona.status, "Active"))
    .orderBy(desc(persona.type), asc(persona.name));
}
