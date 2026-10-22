import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditLog, salesResourceFile } from "@/lib/db/schema";
import { createTestDb, insertTestUser } from "@/lib/db/test-db";
import { PermissionError, type Actor } from "@/lib/permissions";
import { checkUpload, MAX_RESOURCE_BYTES, resourceLinkSchema } from "@/lib/validation/ai-resources";
import {
  addFileResource,
  addLinkResource,
  listResources,
  removeResource,
  resourceFile,
} from "./sales-resources";

let t: Awaited<ReturnType<typeof createTestDb>>;
let admin: Actor;
let rep: Actor;
beforeEach(async () => {
  t = await createTestDb();
  admin = {
    id: (await insertTestUser(t.db, { name: "Somnath", role: "Admin" })).id,
    role: "Admin",
    active: true,
  };
  rep = { id: (await insertTestUser(t.db, { name: "Asha" })).id, role: "User", active: true };
});
afterEach(() => t.cleanup());

const meta = {
  title: "Sales deck 2026",
  description: "The main deck",
  category: "Sales deck" as const,
};

describe("sales resources (F20)", () => {
  it("files: PDF, JPG, PNG, MD and MP4 up to 5 MB", () => {
    for (const name of ["deck.pdf", "shot.JPG", "a.jpeg", "logo.png", "notes.md", "clip.mp4"]) {
      expect(checkUpload(name, 1000).ok).toBe(true);
    }
    expect(checkUpload("deck.pptx", 1000)).toMatchObject({
      ok: false,
      error: "Upload a PDF, JPG, PNG, MD or MP4 file.",
    });
    expect(checkUpload("deck.pdf", MAX_RESOURCE_BYTES).ok).toBe(true);
    expect(checkUpload("deck.pdf", MAX_RESOURCE_BYTES + 1)).toMatchObject({ ok: false });
    expect(checkUpload("deck.pdf", 0).ok).toBe(false);
  });

  it("links must be https", () => {
    expect(resourceLinkSchema.safeParse({ ...meta, url: "http://youtu.be/x" }).success).toBe(false);
    expect(resourceLinkSchema.safeParse({ ...meta, url: "https://youtu.be/x" }).success).toBe(true);
  });

  it("an Admin uploads a file; anyone signed in can fetch it; removing deletes it; audited", async () => {
    const bytes = Buffer.from("%PDF-1.4 test");
    const row = await addFileResource(t.db, admin, meta, { name: "Lumor deck.pdf", bytes });
    expect(row).toMatchObject({
      kind: "file",
      fileName: "Lumor deck.pdf",
      mimeType: "application/pdf",
      sizeBytes: bytes.length,
    });
    const file = await resourceFile(t.db, row.id);
    expect(file?.data.equals(bytes)).toBe(true);
    expect((await listResources(t.db))[0]).toMatchObject({
      title: "Sales deck 2026",
      addedBy: "Somnath",
    });
    await removeResource(t.db, admin, row.id);
    expect(await listResources(t.db)).toEqual([]);
    expect(await t.db.select().from(salesResourceFile)).toEqual([]);
    const actions = (await t.db.select().from(auditLog)).map((a) => `${a.entityType}:${a.action}`);
    expect(actions).toEqual(["Sales resource:Created", "Sales resource:Deleted"]);
  });

  it("Users can't add or remove; uploads over 5 MB are refused", async () => {
    await expect(
      addLinkResource(t.db, rep, { ...meta, url: "https://youtu.be/x" }),
    ).rejects.toThrow(PermissionError);
    const link = await addLinkResource(t.db, admin, {
      ...meta,
      category: "Product video",
      url: "https://youtu.be/x",
    });
    await expect(removeResource(t.db, rep, link.id)).rejects.toThrow(PermissionError);
    await expect(
      addFileResource(t.db, admin, meta, {
        name: "big.mp4",
        bytes: Buffer.alloc(MAX_RESOURCE_BYTES + 1),
      }),
    ).rejects.toThrow(/5 MB at most/);
  });
});
