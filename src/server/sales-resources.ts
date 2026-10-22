// Sales resources (F20): decks, videos, one-pagers and images reps open or download. Files are
// PDF, JPG, PNG, MD or MP4 up to 5 MB, stored in the database; anything bigger goes in as a
// link (D-037). Admins add and remove; everyone reads. Every change is audited.
import { asc, desc, eq } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import { salesResource, salesResourceFile, user } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { checkUpload } from "@/lib/validation/ai-resources";

export class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceError";
  }
}

type Meta = {
  title: string;
  description: string | null;
  category: (typeof salesResource.$inferInsert)["category"];
};

export async function listResources(db: DbOrTx) {
  const rows = await db
    .select({ r: salesResource, addedBy: user.name })
    .from(salesResource)
    .leftJoin(user, eq(user.id, salesResource.createdBy))
    .orderBy(asc(salesResource.category), desc(salesResource.createdAt));
  return rows.map(({ r, addedBy }) => ({ ...r, addedBy }));
}

export async function addLinkResource(db: Db, actor: Actor, data: Meta & { url: string }) {
  assertCan(actor, "resources.manage");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(salesResource)
      .values({ ...data, kind: "link", createdBy: actor.id })
      .returning();
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Sales resource",
      recordId: row.id,
      recordName: row.title,
      action: "Created",
      after: { title: row.title, category: row.category, kind: "link", url: row.url },
    });
    return row;
  });
}

export async function addFileResource(
  db: Db,
  actor: Actor,
  data: Meta,
  file: { name: string; bytes: Buffer },
) {
  assertCan(actor, "resources.manage");
  const check = checkUpload(file.name, file.bytes.length);
  if (!check.ok) throw new ResourceError(check.error);
  const fileName = file.name.replace(/[\\/\r\n"]/g, "_").slice(0, 200);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(salesResource)
      .values({
        ...data,
        kind: "file",
        fileName,
        mimeType: check.type,
        sizeBytes: file.bytes.length,
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(salesResourceFile).values({ resourceId: row.id, data: file.bytes });
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Sales resource",
      recordId: row.id,
      recordName: row.title,
      action: "Created",
      after: {
        title: row.title,
        category: row.category,
        kind: "file",
        fileName,
        sizeBytes: row.sizeBytes,
      },
    });
    return row;
  });
}

export async function removeResource(db: Db, actor: Actor, id: string) {
  assertCan(actor, "resources.manage");
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(salesResource).where(eq(salesResource.id, id));
    if (!row) throw new ResourceError("That resource doesn't exist.");
    await tx.delete(salesResourceFile).where(eq(salesResourceFile.resourceId, id));
    await tx.delete(salesResource).where(eq(salesResource.id, id));
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Sales resource",
      recordId: id,
      recordName: row.title,
      action: "Deleted",
      before: {
        title: row.title,
        category: row.category,
        kind: row.kind,
        url: row.url,
        fileName: row.fileName,
      },
    });
    return row;
  });
}

/** A file to send to a signed-in user (the caller checks they're signed in). */
export async function resourceFile(db: DbOrTx, id: string) {
  const [row] = await db
    .select({ r: salesResource, data: salesResourceFile.data })
    .from(salesResource)
    .innerJoin(salesResourceFile, eq(salesResourceFile.resourceId, salesResource.id))
    .where(eq(salesResource.id, id));
  return row ? { ...row.r, data: row.data } : null;
}
