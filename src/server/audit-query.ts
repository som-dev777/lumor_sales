// Reading the Audit Log (F14): search and filters for the Audit Log page and CSV export,
// and a single record's history for detail pages. Read-only: nothing here can change it.
import { and, asc, count, desc, eq, gte, lt, or, sql, type SQL } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/client";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/db/enums";
import { auditLog, user, type AuditChanges } from "@/lib/db/schema";
import { istDateSpan, isIstDate } from "@/lib/time";

export type AuditFilters = {
  q?: string;
  userId?: string;
  entityType?: string;
  action?: AuditAction;
  /** IST dates, YYYY-MM-DD, both included. */
  from?: string;
  to?: string;
};

export type AuditEntryView = {
  id: string;
  occurredAt: Date;
  userId: string | null;
  userName: string | null;
  entityType: string;
  recordName: string;
  recordId: string;
  action: AuditAction;
  changes: AuditChanges;
};

/** Reads filters from the page address (?q=…&action=…). Anything invalid is ignored. */
export function parseAuditFilters(
  params: Record<string, string | string[] | undefined>,
): AuditFilters {
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s : undefined;
  };
  const action = one("action");
  const from = one("from");
  const to = one("to");
  return {
    q: one("q")?.slice(0, 200),
    userId: one("user"),
    entityType: one("type")?.slice(0, 50),
    action:
      action && (AUDIT_ACTIONS as readonly string[]).includes(action)
        ? (action as AuditAction)
        : undefined,
    from: from && isIstDate(from) ? from : undefined,
    to: to && isIstDate(to) ? to : undefined,
  };
}

function whereFor(f: AuditFilters): SQL | undefined {
  const parts: SQL[] = [];
  if (f.userId === "system") parts.push(sql`${auditLog.userId} IS NULL`);
  else if (f.userId) parts.push(eq(auditLog.userId, f.userId));
  if (f.entityType) parts.push(eq(auditLog.entityType, f.entityType));
  if (f.action) parts.push(eq(auditLog.action, f.action));
  if (f.from || f.to) {
    const span = istDateSpan(f.from ?? "2000-01-01", f.to ?? "2999-12-31");
    if (f.from) parts.push(gte(auditLog.occurredAt, span.start));
    if (f.to) parts.push(lt(auditLog.occurredAt, span.end));
  }
  if (f.q) {
    const pattern = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const match = (expr: SQL) => sql`${expr} LIKE ${pattern} ESCAPE '\\'`;
    parts.push(
      or(
        match(sql`${auditLog.recordName}`),
        match(sql`${auditLog.entityType}`),
        match(sql`${auditLog.action}`),
        match(sql`${auditLog.changes}`),
        match(sql`coalesce(${user.name}, '')`),
        match(sql`coalesce(${user.email}, '')`),
      )!,
    );
  }
  return parts.length ? and(...parts) : undefined;
}

function baseQuery(db: DbOrTx) {
  return db
    .select({
      id: auditLog.id,
      occurredAt: auditLog.occurredAt,
      userId: auditLog.userId,
      userName: user.name,
      entityType: auditLog.entityType,
      recordName: auditLog.recordName,
      recordId: auditLog.recordId,
      action: auditLog.action,
      changes: auditLog.changes,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.userId));
}

/** One page of matching entries, newest first, plus the total number of matches. */
export async function searchAuditLog(
  db: DbOrTx,
  filters: AuditFilters,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ entries: AuditEntryView[]; total: number }> {
  const where = whereFor(filters);
  const [entries, [{ n }]] = await Promise.all([
    baseQuery(db)
      .where(where)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ n: count() })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.userId))
      .where(where),
  ]);
  return { entries, total: n };
}

/** Every matching entry, newest first (for CSV export). Capped to keep the file sensible. */
export async function allMatchingEntries(db: DbOrTx, filters: AuditFilters, cap = 50_000) {
  return baseQuery(db)
    .where(whereFor(filters))
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
    .limit(cap);
}

/** One record's own change history (shown on its detail page, also to Users). */
export async function historyFor(db: DbOrTx, entityType: string, recordId: string) {
  return baseQuery(db)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.recordId, recordId)))
    .orderBy(desc(auditLog.occurredAt), desc(auditLog.id));
}

/** Choices for the filter dropdowns. */
export async function auditFilterOptions(db: DbOrTx) {
  const [types, users] = await Promise.all([
    db
      .selectDistinct({ entityType: auditLog.entityType })
      .from(auditLog)
      .orderBy(asc(auditLog.entityType)),
    db.select({ id: user.id, name: user.name }).from(user).orderBy(asc(user.name)),
  ]);
  return { entityTypes: types.map((t) => t.entityType), users };
}
