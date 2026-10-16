// The playbook library (F04 personas, F05 account filters, F06 templates): the shared rules
// from docs/features/F04-personas.md. Every change checks the shared permission rules and
// writes an audit entry in the same transaction.
import { and, count, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import {
  accountFilter,
  activity,
  company,
  person,
  persona,
  proposal,
  template,
  templateRevision,
} from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import type { AccountFilterData, PersonaData, TemplateData } from "@/lib/validation/library";

export type LibraryKind = "persona" | "accountFilter" | "template";

/** How each kind is named in the audit log and on the Approvals page. */
export const KIND_LABEL = {
  persona: "Persona",
  accountFilter: "AccountFilter",
  template: "Template",
} as const;
export const KIND_NOUN = {
  persona: "persona",
  accountFilter: "account filter",
  template: "template",
} as const;

export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

type PersonaRow = typeof persona.$inferSelect;
type FilterRow = typeof accountFilter.$inferSelect;
type TemplateRow = typeof template.$inferSelect;
export type LibraryRow = PersonaRow | FilterRow | TemplateRow;

/** The columns all three tables share. */
type CommonUpdate = Partial<Pick<PersonaRow, "type" | "ownerId" | "status" | "proposalStatus">>;

// --- Loading and updating, per kind -------------------------------------------------------

export async function loadItem(tx: DbOrTx, kind: LibraryKind, id: string): Promise<LibraryRow> {
  const rows =
    kind === "persona"
      ? await tx.select().from(persona).where(eq(persona.id, id))
      : kind === "accountFilter"
        ? await tx.select().from(accountFilter).where(eq(accountFilter.id, id))
        : await tx.select().from(template).where(eq(template.id, id));
  if (!rows[0]) throw new LibraryError(`That ${KIND_NOUN[kind]} doesn't exist.`);
  return rows[0];
}

async function setCommon(tx: DbOrTx, kind: LibraryKind, id: string, values: CommonUpdate) {
  if (kind === "persona")
    return (await tx.update(persona).set(values).where(eq(persona.id, id)).returning())[0];
  if (kind === "accountFilter")
    return (
      await tx.update(accountFilter).set(values).where(eq(accountFilter.id, id)).returning()
    )[0];
  return (await tx.update(template).set(values).where(eq(template.id, id)).returning())[0];
}

/** The fields worth showing in the audit log (no ids or bookkeeping). */
function auditFields(row: LibraryRow) {
  const { id: _id, createdAt: _c, updatedAt: _u, createdBy: _b, ...rest } = row;
  return rest;
}

const itemName = (row: LibraryRow) => ("code" in row ? `${row.code} ${row.name}` : row.name);

// --- How many records point to an item (blocks deleting) -----------------------------------

export async function usageOf(tx: DbOrTx, kind: LibraryKind, id: string) {
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  if (kind === "persona") {
    const leads = await n(tx.select({ n: count() }).from(person).where(eq(person.personaId, id)));
    const templates = await n(
      tx.select({ n: count() }).from(template).where(eq(template.personaId, id)),
    );
    return { leads, other: templates, total: leads + templates };
  }
  if (kind === "accountFilter") {
    const leads = await n(
      tx.select({ n: count() }).from(person).where(eq(person.accountFilterId, id)),
    );
    const companies = await n(
      tx.select({ n: count() }).from(company).where(eq(company.accountFilterId, id)),
    );
    return { leads, other: companies, total: leads + companies };
  }
  const leads = await n(
    tx.select({ n: count() }).from(person).where(eq(person.openerTemplateId, id)),
  );
  const activities = await n(
    tx.select({ n: count() }).from(activity).where(eq(activity.templateId, id)),
  );
  return { leads, other: activities, total: leads + activities };
}

function inUseMessage(kind: LibraryKind, usage: Awaited<ReturnType<typeof usageOf>>) {
  const parts: string[] = [];
  if (usage.leads) parts.push(`${usage.leads} lead${usage.leads === 1 ? "" : "s"}`);
  if (usage.other) {
    const what =
      kind === "persona" ? "template" : kind === "accountFilter" ? "compan" : "logged message";
    const plural =
      kind === "accountFilter" ? (usage.other === 1 ? "y" : "ies") : usage.other === 1 ? "" : "s";
    parts.push(`${usage.other} ${what}${plural}`);
  }
  return `This ${KIND_NOUN[kind]} is used by ${parts.join(" and ")}, so it can't be deleted. Archive it instead.`;
}

// --- Rules that need a check before saving ------------------------------------------------

async function assertUsablePersona(tx: DbOrTx, personaId: string | null) {
  if (!personaId) return;
  const [row] = await tx
    .select({ status: persona.status })
    .from(persona)
    .where(eq(persona.id, personaId));
  if (!row) throw new LibraryError("That persona doesn't exist.");
  if (row.status === "Archived")
    throw new LibraryError("That persona is archived. Pick another one.");
}

async function assertOfficialCodeFree(tx: DbOrTx, code: string, exceptId?: string) {
  const rows = await tx
    .select({ id: accountFilter.id })
    .from(accountFilter)
    .where(and(eq(accountFilter.type, "Official"), eq(accountFilter.code, code)));
  if (rows.some((r) => r.id !== exceptId)) {
    throw new LibraryError(
      `An Official account filter already uses the code ${code}. Choose another code.`,
    );
  }
}

// --- Create --------------------------------------------------------------------------------

export type NewItem =
  | { kind: "persona"; data: PersonaData }
  | { kind: "accountFilter"; data: AccountFilterData }
  | { kind: "template"; data: TemplateData };

export async function createItem(
  db: Db,
  actor: Actor,
  type: "Official" | "Personal",
  item: NewItem,
) {
  assertCan(actor, "library.create", { type });
  return db.transaction(async (tx) => {
    const base = { type, ownerId: actor.id, createdBy: actor.id };
    let row: LibraryRow;
    if (item.kind === "persona") {
      [row] = await tx
        .insert(persona)
        .values({ ...item.data, ...base })
        .returning();
    } else if (item.kind === "accountFilter") {
      if (type === "Official") await assertOfficialCodeFree(tx, item.data.code);
      [row] = await tx
        .insert(accountFilter)
        .values({ ...item.data, ...base })
        .returning();
    } else {
      await assertUsablePersona(tx, item.data.personaId);
      [row] = await tx
        .insert(template)
        .values({ ...item.data, ...base })
        .returning();
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[item.kind],
      recordId: row.id,
      recordName: itemName(row),
      action: "Created",
      after: auditFields(row),
    });
    return row;
  });
}

// --- Edit ----------------------------------------------------------------------------------

export async function updateItem(db: Db, actor: Actor, id: string, item: NewItem) {
  return db.transaction(async (tx) => {
    const before = await loadItem(tx, item.kind, id);
    assertCan(actor, "library.edit", before);
    let after: LibraryRow;

    if (item.kind === "persona") {
      [after] = await tx.update(persona).set(item.data).where(eq(persona.id, id)).returning();
    } else if (item.kind === "accountFilter") {
      if (before.type === "Official") await assertOfficialCodeFree(tx, item.data.code, id);
      [after] = await tx
        .update(accountFilter)
        .set(item.data)
        .where(eq(accountFilter.id, id))
        .returning();
    } else {
      const old = before as TemplateRow;
      if (item.data.personaId !== old.personaId) await assertUsablePersona(tx, item.data.personaId);
      // Editing the wording keeps the old wording as a revision (F06).
      const bodyChanged = item.data.body !== old.body;
      if (bodyChanged) {
        await tx.insert(templateRevision).values({
          templateId: id,
          revision: old.revision,
          body: old.body,
          createdBy: actor.id,
        });
      }
      [after] = await tx
        .update(template)
        .set({ ...item.data, revision: bodyChanged ? old.revision + 1 : old.revision })
        .where(eq(template.id, id))
        .returning();
    }

    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[item.kind],
      recordId: id,
      recordName: itemName(after),
      action: "Updated",
      before: auditFields(before),
      after: auditFields(after),
    });
    return after;
  });
}

// --- Archive and restore -------------------------------------------------------------------

/** A pending proposal for this item is withdrawn when the owner archives or deletes it (D-017). */
async function withdrawPendingProposal(
  tx: DbOrTx,
  actor: Actor,
  kind: LibraryKind,
  row: LibraryRow,
) {
  const [pending] = await tx
    .select()
    .from(proposal)
    .where(
      and(
        eq(proposal.itemType, KIND_LABEL[kind]),
        eq(proposal.itemId, row.id),
        eq(proposal.decision, "Pending"),
      ),
    );
  if (!pending) return false;
  await tx
    .update(proposal)
    .set({
      decision: "Rejected",
      decidedBy: actor.id,
      decidedAt: new Date(),
      reviewerNote: "Withdrawn by the owner",
    })
    .where(eq(proposal.id, pending.id));
  await writeAudit(tx, {
    userId: actor.id,
    entityType: "Proposal",
    recordId: pending.id,
    recordName: itemName(row),
    action: "Rejected",
    before: { decision: "Pending" },
    after: { decision: "Rejected", reviewerNote: "Withdrawn by the owner" },
  });
  return true;
}

export async function setArchived(
  db: Db,
  actor: Actor,
  kind: LibraryKind,
  id: string,
  archived: boolean,
) {
  return db.transaction(async (tx) => {
    const before = await loadItem(tx, kind, id);
    assertCan(actor, "library.edit", before);
    const status = archived ? "Archived" : "Active";
    if (before.status === status) return before;

    const update: CommonUpdate = { status };
    if (archived && (await withdrawPendingProposal(tx, actor, kind, before)))
      update.proposalStatus = "Rejected";
    const after = await setCommon(tx, kind, id, update);
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[kind],
      recordId: id,
      recordName: itemName(before),
      action: "Updated",
      before: { status: before.status, proposalStatus: before.proposalStatus },
      after: { status: after.status, proposalStatus: after.proposalStatus },
    });
    return after;
  });
}

// --- Delete --------------------------------------------------------------------------------

export async function deleteItem(db: Db, actor: Actor, kind: LibraryKind, id: string) {
  return db.transaction(async (tx) => {
    const before = await loadItem(tx, kind, id);
    assertCan(actor, "library.delete", before);
    const usage = await usageOf(tx, kind, id);
    if (usage.total > 0) throw new LibraryError(inUseMessage(kind, usage));

    await withdrawPendingProposal(tx, actor, kind, before);
    if (kind === "persona") await tx.delete(persona).where(eq(persona.id, id));
    else if (kind === "accountFilter")
      await tx.delete(accountFilter).where(eq(accountFilter.id, id));
    else {
      // A template's old wordings belong to it and go with it.
      await tx.delete(templateRevision).where(eq(templateRevision.templateId, id));
      await tx.delete(template).where(eq(template.id, id));
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[kind],
      recordId: id,
      recordName: itemName(before),
      action: "Deleted",
      before: auditFields(before),
    });
  });
}

// --- Duplicate -----------------------------------------------------------------------------

/** Anyone can copy any item; the copy is their own Personal item (F04). */
export async function duplicateItem(db: Db, actor: Actor, kind: LibraryKind, id: string) {
  assertCan(actor, "library.duplicate");
  return db.transaction(async (tx) => {
    const source = await loadItem(tx, kind, id);
    const {
      id: _id,
      createdAt: _c,
      updatedAt: _u,
      createdBy: _b,
      type: _t,
      ownerId: _o,
      status: _s,
      proposalStatus: _p,
      ...fields
    } = source;
    const fresh = {
      type: "Personal" as const,
      ownerId: actor.id,
      createdBy: actor.id,
      status: "Active" as const,
      proposalStatus: "None" as const,
      name: `Copy of ${source.name}`.slice(0, 100),
    };
    let copy: LibraryRow;
    if (kind === "persona") {
      [copy] = await tx
        .insert(persona)
        .values({
          ...(fields as Omit<PersonaRow, keyof typeof fresh | "id" | "createdAt" | "updatedAt">),
          ...fresh,
        })
        .returning();
    } else if (kind === "accountFilter") {
      const f = fields as Omit<FilterRow, keyof typeof fresh | "id" | "createdAt" | "updatedAt">;
      [copy] = await tx
        .insert(accountFilter)
        .values({ ...f, ...fresh, code: `${f.code}-copy`.slice(0, 10) })
        .returning();
    } else {
      const f = fields as Omit<TemplateRow, keyof typeof fresh | "id" | "createdAt" | "updatedAt">;
      [copy] = await tx
        .insert(template)
        .values({ ...f, ...fresh, revision: 1 })
        .returning();
    }
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[kind],
      recordId: copy.id,
      recordName: itemName(copy),
      action: "Created",
      after: { ...auditFields(copy), duplicatedFrom: itemName(source) },
    });
    return copy;
  });
}

// --- Propose as Official (F07) -------------------------------------------------------------

export async function proposeItem(db: Db, actor: Actor, kind: LibraryKind, id: string) {
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, kind, id);
    assertCan(actor, "library.propose", item);
    if (item.status === "Archived")
      throw new LibraryError("Restore this item before proposing it.");
    if (item.proposalStatus === "Proposed")
      throw new LibraryError("This is already waiting for an Admin.");

    const [created] = await tx
      .insert(proposal)
      .values({ itemType: KIND_LABEL[kind], itemId: id, proposedBy: actor.id, createdBy: actor.id })
      .returning();
    await setCommon(tx, kind, id, { proposalStatus: "Proposed" });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Proposal",
      recordId: created.id,
      recordName: itemName(item),
      action: "Created",
      after: { itemType: KIND_LABEL[kind], item: itemName(item), decision: "Pending" },
    });
    return created;
  });
}

export { itemName, setCommon, assertOfficialCodeFree, auditFields };
