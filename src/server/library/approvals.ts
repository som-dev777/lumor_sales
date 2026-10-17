// Approvals (F07): Admins approve or reject proposals to make a Personal item Official.
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { proposal, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import {
  assertOfficialCodeFree,
  itemName,
  KIND_LABEL,
  LibraryError,
  loadItem,
  setCommon,
  type LibraryKind,
  type LibraryRow,
} from "./items";

const KIND_FOR_LABEL = {
  Persona: "persona",
  AccountFilter: "accountFilter",
  Template: "template",
} as const;

async function loadPendingProposal(tx: DbOrTx, proposalId: string) {
  const [row] = await tx.select().from(proposal).where(eq(proposal.id, proposalId));
  if (!row) throw new LibraryError("That proposal doesn't exist.");
  if (row.decision !== "Pending") throw new LibraryError("That proposal has already been decided.");
  if (row.itemType === "Plan") throw new LibraryError("Plan proposals are decided on the plan.");
  return { row, kind: KIND_FOR_LABEL[row.itemType] as LibraryKind };
}

/** The item becomes Official and owned by the approving Admin; the proposer stays on the Proposal. */
export async function approveProposal(db: Db, actor: Actor, proposalId: string) {
  assertCan(actor, "proposal.decide");
  return db.transaction(async (tx) => {
    const { row, kind } = await loadPendingProposal(tx, proposalId);
    const item = await loadItem(tx, kind, row.itemId);
    if (item.status === "Archived")
      throw new LibraryError("This item was archived. It can't be approved.");
    if ("code" in item) await assertOfficialCodeFree(tx, item.code, item.id);

    const now = new Date();
    const after = await setCommon(tx, kind, item.id, {
      type: "Official",
      ownerId: actor.id,
      proposalStatus: "Approved",
    });
    await tx
      .update(proposal)
      .set({ decision: "Approved", decidedBy: actor.id, decidedAt: now })
      .where(eq(proposal.id, proposalId));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[kind],
      recordId: item.id,
      recordName: itemName(item),
      action: "Approved",
      before: { type: item.type, ownerId: item.ownerId, proposalStatus: item.proposalStatus },
      after: {
        type: after.type,
        ownerId: after.ownerId,
        proposalStatus: after.proposalStatus,
        proposedBy: row.proposedBy,
      },
    });
    return after;
  });
}

/** The item stays Personal, marked Rejected with the Admin's note. The owner can propose again. */
export async function rejectProposal(
  db: Db,
  actor: Actor,
  proposalId: string,
  note: string | null,
) {
  assertCan(actor, "proposal.decide");
  return db.transaction(async (tx) => {
    const { row, kind } = await loadPendingProposal(tx, proposalId);
    const item = await loadItem(tx, kind, row.itemId);
    await setCommon(tx, kind, item.id, { proposalStatus: "Rejected" });
    await tx
      .update(proposal)
      .set({ decision: "Rejected", decidedBy: actor.id, decidedAt: new Date(), reviewerNote: note })
      .where(eq(proposal.id, proposalId));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: KIND_LABEL[kind],
      recordId: item.id,
      recordName: itemName(item),
      action: "Rejected",
      before: { proposalStatus: item.proposalStatus },
      after: { proposalStatus: "Rejected", reviewerNote: note },
    });
  });
}

export type ProposalView = {
  id: string;
  kind: LibraryKind;
  itemId: string;
  itemName: string;
  item: LibraryRow | null;
  proposedBy: string;
  proposedByName: string;
  proposedAt: Date;
  decision: "Pending" | "Approved" | "Rejected";
  decidedByName: string | null;
  decidedAt: Date | null;
  reviewerNote: string | null;
};

const proposer = alias(user, "proposer");
const decider = alias(user, "decider");

async function withItems(
  tx: DbOrTx,
  rows: Awaited<ReturnType<typeof selectProposals>>,
): Promise<ProposalView[]> {
  return Promise.all(
    rows.map(async (r) => {
      const kind = KIND_FOR_LABEL[r.itemType as keyof typeof KIND_FOR_LABEL] as LibraryKind;
      const item = await loadItem(tx, kind, r.itemId).catch(() => null);
      return {
        id: r.id,
        kind,
        itemId: r.itemId,
        itemName: item ? itemName(item) : "(deleted item)",
        item,
        proposedBy: r.proposedBy,
        proposedByName: r.proposedByName,
        proposedAt: r.proposedAt,
        decision: r.decision,
        decidedByName: r.decidedByName,
        decidedAt: r.decidedAt,
        reviewerNote: r.reviewerNote,
      };
    }),
  );
}

function selectProposals(tx: DbOrTx) {
  return tx
    .select({
      id: proposal.id,
      itemType: proposal.itemType,
      itemId: proposal.itemId,
      proposedBy: proposal.proposedBy,
      proposedByName: proposer.name,
      proposedAt: proposal.proposedAt,
      decision: proposal.decision,
      decidedByName: decider.name,
      decidedAt: proposal.decidedAt,
      reviewerNote: proposal.reviewerNote,
    })
    .from(proposal)
    .innerJoin(proposer, eq(proposer.id, proposal.proposedBy))
    .leftJoin(decider, eq(decider.id, proposal.decidedBy));
}

/** The Admin queue, oldest first. */
export async function listPendingProposals(tx: DbOrTx) {
  return withItems(
    tx,
    await selectProposals(tx)
      .where(eq(proposal.decision, "Pending"))
      .orderBy(asc(proposal.proposedAt)),
  );
}

export async function countPendingProposals(tx: DbOrTx) {
  return (
    await tx.select({ id: proposal.id }).from(proposal).where(eq(proposal.decision, "Pending"))
  ).length;
}

/** Recently decided proposals, newest first. */
export async function listRecentDecisions(tx: DbOrTx, limit = 20) {
  return withItems(
    tx,
    await selectProposals(tx)
      .where(ne(proposal.decision, "Pending"))
      .orderBy(desc(proposal.decidedAt))
      .limit(limit),
  );
}

/** What the proposer sees: their own recent proposals of one kind, with outcomes. */
export async function myProposals(tx: DbOrTx, userId: string, kind: LibraryKind, limit = 5) {
  return withItems(
    tx,
    await selectProposals(tx)
      .where(and(eq(proposal.proposedBy, userId), inArray(proposal.itemType, [KIND_LABEL[kind]])))
      .orderBy(desc(proposal.proposedAt))
      .limit(limit),
  );
}
