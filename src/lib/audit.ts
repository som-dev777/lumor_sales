// The ONE audit writer (F14). Every data change calls writeAudit() inside the same
// transaction as the change, so either both are saved or neither is.
import type { DbOrTx } from "./db/client";
import type { AuditAction } from "./db/enums";
import { auditLog, type AuditChanges } from "./db/schema";

type Row = Record<string, unknown>;

/** Never written to the audit log, whatever table they come from. */
const SECRET_FIELDS = new Set([
  "password",
  "token",
  "tokenHash",
  "accessToken",
  "refreshToken",
  "idToken",
  "secret",
]);

/** Bookkeeping fields that change on every save and tell a reader nothing. */
const IGNORED_FIELDS = new Set(["createdAt", "updatedAt"]);

/** Makes a value safe to store as JSON and to compare: dates become ISO text. */
function normalise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

/**
 * Works out what changed between two versions of a record.
 * - Created: `before` is null, so every field is listed with before = null.
 * - Deleted: `after` is null, so every field is listed with after = null.
 * - Otherwise: only fields whose value actually changed.
 * Secret and bookkeeping fields are always left out.
 */
export function diffChanges(before: Row | null, after: Row | null): AuditChanges {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: AuditChanges = {};
  for (const key of keys) {
    if (SECRET_FIELDS.has(key) || IGNORED_FIELDS.has(key)) continue;
    const b = before ? before[key] : null;
    const a = after ? after[key] : null;
    // Partial updates: a field missing from `after` was not touched.
    if (before && after && !(key in after)) continue;
    if (before && after && sameValue(b, a)) continue;
    changes[key] = { before: normalise(b), after: normalise(a) };
  }
  return changes;
}

export type AuditEntry = {
  /** Who made the change. null for system actions (e.g. the seed script). */
  userId: string | null;
  /** e.g. "User", "Persona", "Person". */
  entityType: string;
  recordId: string;
  /** A readable name for the record at the time of the change. */
  recordName: string;
  action: AuditAction;
  before?: Row | null;
  after?: Row | null;
};

/**
 * Records one change. Call it with the transaction (`tx`) the change runs in.
 * An "Updated" entry where nothing actually changed is skipped. Returns whether a
 * row was written.
 */
export async function writeAudit(tx: DbOrTx, entry: AuditEntry): Promise<boolean> {
  const changes = diffChanges(entry.before ?? null, entry.after ?? null);
  if (entry.action === "Updated" && Object.keys(changes).length === 0) return false;

  await tx.insert(auditLog).values({
    occurredAt: new Date(),
    userId: entry.userId,
    createdBy: entry.userId,
    entityType: entry.entityType,
    recordId: entry.recordId,
    recordName: entry.recordName,
    action: entry.action,
    changes,
  });
  return true;
}
