// Company offices (F28, D-054): a company's main office and its other offices. Any rep can add
// one; its owner, the company's owner or an Admin can edit or delete it; the owner can be changed
// by the office's owner or an Admin (both owners are told). Every change is audited.
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { company, companyOffice, person, user } from "@/lib/db/schema";
import { assertCan, can, PermissionError, type Actor } from "@/lib/permissions";
import type { OfficeData } from "@/lib/validation/leads";
import { addNotificationsTx } from "../notifications";
import { assertActiveOwner, LeadError } from "./companies";
import { notifyOwnerChange } from "./ownership";

export type OfficeRow = typeof companyOffice.$inferSelect;

export type OfficeView = OfficeRow & {
  ownerName: string;
  addedByName: string | null;
  peopleCount: number;
};

/** A company's offices: the main office first, then by name. */
export async function listOffices(db: DbOrTx, companyId: string): Promise<OfficeView[]> {
  const owner = alias(user, "office_owner");
  const adder = alias(user, "office_adder");
  const rows = await db
    .select({
      o: companyOffice,
      ownerName: owner.name,
      addedByName: adder.name,
      peopleCount: sql<number>`(select count(*) from ${person} where ${person.officeId} = ${companyOffice.id})`,
    })
    .from(companyOffice)
    .innerJoin(owner, eq(owner.id, companyOffice.ownerId))
    .leftJoin(adder, eq(adder.id, companyOffice.createdBy))
    .where(eq(companyOffice.companyId, companyId))
    .orderBy(desc(companyOffice.isMain), asc(companyOffice.name));
  return rows.map((r) => ({
    ...r.o,
    ownerName: r.ownerName,
    addedByName: r.addedByName,
    peopleCount: Number(r.peopleCount),
  }));
}

/** Every office, for the person form's Office choice (grouped by company in the form). */
export async function officeChoices(db: DbOrTx) {
  return db
    .select({
      id: companyOffice.id,
      companyName: company.name,
      name: companyOffice.name,
      city: companyOffice.city,
      isMain: companyOffice.isMain,
    })
    .from(companyOffice)
    .innerJoin(company, eq(company.id, companyOffice.companyId))
    .orderBy(asc(company.name), desc(companyOffice.isMain), asc(companyOffice.name));
}

/** The office's owner, the company's owner or an Admin. */
export function canEditOffice(actor: Actor, office: { ownerId: string }, companyOwnerId: string) {
  return (
    can(actor, "lead.edit", { ownerId: office.ownerId }) ||
    can(actor, "lead.edit", { ownerId: companyOwnerId })
  );
}

/** The office's owner or an Admin. */
export const canChangeOfficeOwner = (actor: Actor, office: { ownerId: string }) =>
  can(actor, "lead.edit", { ownerId: office.ownerId });

async function loadCompanyRow(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(company).where(eq(company.id, id));
  if (!row) throw new LeadError("That company doesn't exist.");
  return row;
}

async function loadOffice(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(companyOffice).where(eq(companyOffice.id, id));
  if (!row) throw new LeadError("That office doesn't exist.");
  return row;
}

async function assertNameFree(tx: DbOrTx, companyId: string, name: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: companyOffice.id, name: companyOffice.name })
    .from(companyOffice)
    .where(
      and(
        eq(companyOffice.companyId, companyId),
        sql`lower(trim(${companyOffice.name})) = ${name.trim().toLowerCase()}`,
        exceptId ? ne(companyOffice.id, exceptId) : undefined,
      ),
    );
  if (clash) throw new LeadError(`This company already has an office called ${clash.name}.`);
}

/** Only one main office: marking this one main un-marks the other (audited). */
async function moveMainMark(tx: DbOrTx, actor: Actor, companyId: string, exceptId?: string) {
  const others = await tx
    .select()
    .from(companyOffice)
    .where(
      and(
        eq(companyOffice.companyId, companyId),
        eq(companyOffice.isMain, true),
        exceptId ? ne(companyOffice.id, exceptId) : undefined,
      ),
    );
  for (const o of others) {
    await tx.update(companyOffice).set({ isMain: false }).where(eq(companyOffice.id, o.id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Office",
      recordId: o.id,
      recordName: o.name,
      action: "Updated",
      before: { isMain: true },
      after: { isMain: false, via: "Another office became the main office" },
    });
  }
}

const officeAudit = (o: OfficeRow) => ({
  companyId: o.companyId,
  name: o.name,
  city: o.city,
  country: o.country,
  address: o.address,
  isMain: o.isMain,
  ownerId: o.ownerId,
});

const label = (companyName: string, officeName: string) => `${companyName} · ${officeName}`;

/** Adds an office. Its owner is whoever adds it, unless an Admin picks someone else. */
export async function createOffice(db: Db, actor: Actor, companyId: string, data: OfficeData) {
  assertCan(actor, "lead.create");
  return db.transaction(async (tx) => {
    const c = await loadCompanyRow(tx, companyId);
    let ownerId = actor.id;
    if (data.ownerId && data.ownerId !== actor.id) {
      assertCan(actor, "lead.reassign");
      await assertActiveOwner(tx, data.ownerId);
      ownerId = data.ownerId;
    }
    await assertNameFree(tx, companyId, data.name);
    if (data.isMain) await moveMainMark(tx, actor, companyId);
    const [row] = await tx
      .insert(companyOffice)
      .values({
        companyId,
        name: data.name,
        city: data.city,
        country: data.country,
        address: data.address,
        isMain: data.isMain,
        ownerId,
        createdBy: actor.id,
      })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Office",
      recordId: row.id,
      recordName: label(c.name, row.name),
      action: "Created",
      after: officeAudit(row),
    });
    if (ownerId !== actor.id) {
      const [me] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actor.id));
      await addNotificationsTx(tx, actor.id, [
        {
          userId: ownerId,
          kind: "added",
          title: `You now own the office ${label(c.name, row.name)}`,
          body: `${me?.name ?? "Someone"} added it and made you its owner.`,
          link: `/companies/${companyId}`,
        },
      ]);
    }
    return row;
  });
}

/** Edits an office (its owner, the company's owner or an Admin). */
export async function updateOffice(db: Db, actor: Actor, officeId: string, data: OfficeData) {
  return db.transaction(async (tx) => {
    const before = await loadOffice(tx, officeId);
    const c = await loadCompanyRow(tx, before.companyId);
    if (!canEditOffice(actor, before, c.ownerId)) {
      throw new PermissionError(
        "Only the office's owner, the company's owner or an Admin can change it.",
      );
    }
    let ownerId = before.ownerId;
    if (data.ownerId && data.ownerId !== before.ownerId) {
      if (!canChangeOfficeOwner(actor, before)) {
        throw new PermissionError("Only the office's owner or an Admin can give it a new owner.");
      }
      await assertActiveOwner(tx, data.ownerId);
      ownerId = data.ownerId;
    }
    await assertNameFree(tx, before.companyId, data.name, officeId);
    if (data.isMain && !before.isMain) await moveMainMark(tx, actor, before.companyId, officeId);
    const [after] = await tx
      .update(companyOffice)
      .set({
        name: data.name,
        city: data.city,
        country: data.country,
        address: data.address,
        isMain: data.isMain,
        ownerId,
        updatedAt: new Date(),
      })
      .where(eq(companyOffice.id, officeId))
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Office",
      recordId: officeId,
      recordName: label(c.name, after.name),
      action: ownerId !== before.ownerId ? "Reassigned" : "Updated",
      before: officeAudit(before),
      after: officeAudit(after),
    });
    await notifyOwnerChange(
      tx,
      actor,
      { kind: "office", name: label(c.name, after.name), link: `/companies/${c.id}` },
      before.ownerId,
      ownerId,
    );
    return after;
  });
}

/** Deletes an office with no people linked (its owner, the company's owner or an Admin). */
export async function deleteOffice(db: Db, actor: Actor, officeId: string) {
  return db.transaction(async (tx) => {
    const before = await loadOffice(tx, officeId);
    const c = await loadCompanyRow(tx, before.companyId);
    if (!canEditOffice(actor, before, c.ownerId)) {
      throw new PermissionError(
        "Only the office's owner, the company's owner or an Admin can delete it.",
      );
    }
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)` })
      .from(person)
      .where(eq(person.officeId, officeId));
    if (Number(n) > 0) {
      throw new LeadError(
        `${n} ${Number(n) === 1 ? "person works" : "people work"} from this office. Link them to another office first.`,
      );
    }
    await tx.delete(companyOffice).where(eq(companyOffice.id, officeId));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Office",
      recordId: officeId,
      recordName: label(c.name, before.name),
      action: "Deleted",
      before: officeAudit(before),
    });
    return before;
  });
}

/**
 * The office to save on a person: it must be one of their company's offices. When the company
 * changed and the old office no longer fits, it's cleared (`previous` is the saved office).
 */
export async function officeForPerson(
  tx: DbOrTx,
  officeId: string | null | undefined,
  companyId: string | null,
  previous?: string | null,
): Promise<string | null> {
  if (!officeId) return null;
  const [o] = await tx
    .select({ companyId: companyOffice.companyId })
    .from(companyOffice)
    .where(eq(companyOffice.id, officeId));
  if (o && o.companyId === companyId) return officeId;
  if (previous !== undefined && officeId === previous) return null;
  throw new LeadError("That office isn't one of this company's offices. Pick another office.");
}
