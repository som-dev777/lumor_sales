// In-app notifications (F25). Created inside the same transaction as the change they report
// (the change's own audit entry covers them); marking them read is a change of its own:
// own notifications only, audited.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import type { Db, DbOrTx } from "@/lib/db/client";
import type { NotificationKind } from "@/lib/db/enums";
import { notification } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import { PermissionError } from "@/lib/permissions";

export const NOTIFICATIONS_SHOWN = 50;

export type NewNotification = {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
  bookingId?: string | null;
};

/** Adds notifications (inside the caller's transaction). `actorId` is who caused them. */
export async function addNotificationsTx(
  tx: DbOrTx,
  actorId: string | null,
  items: NewNotification[],
) {
  if (items.length === 0) return;
  await tx.insert(notification).values(
    items.map((n) => ({
      userId: n.userId,
      kind: n.kind,
      title: n.title.slice(0, 200),
      body: n.body.slice(0, 1000),
      link: n.link ?? null,
      bookingId: n.bookingId ?? null,
      createdBy: actorId,
    })),
  );
}

export type NotificationView = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
};

/** The rep's latest notifications, newest first. */
export async function listNotifications(db: DbOrTx, userId: string): Promise<NotificationView[]> {
  const rows = await db
    .select()
    .from(notification)
    .where(eq(notification.userId, userId))
    .orderBy(desc(notification.createdAt))
    .limit(NOTIFICATIONS_SHOWN);
  return rows.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    createdAt: n.createdAt,
    read: n.readAt !== null,
  }));
}

export async function unreadCount(db: DbOrTx, userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return Number(n);
}

/**
 * Marks the actor's notifications read: the given ones, or all unread when `ids` is null.
 * Someone else's notification is refused.
 */
export async function markRead(
  db: Db,
  actor: Actor,
  ids: string[] | null,
  now = new Date(),
): Promise<number> {
  if (!actor.active) throw new PermissionError("Access disabled, contact your admin");
  return db.transaction(async (tx) => {
    const where = and(
      eq(notification.userId, actor.id),
      isNull(notification.readAt),
      ids ? inArray(notification.id, ids) : undefined,
    );
    if (ids) {
      const owners = await tx
        .select({ userId: notification.userId })
        .from(notification)
        .where(inArray(notification.id, ids));
      if (owners.some((o) => o.userId !== actor.id)) throw new PermissionError("Not allowed");
    }
    const changed = await tx
      .update(notification)
      .set({ readAt: now })
      .where(where)
      .returning({ id: notification.id });
    if (changed.length === 0) return 0;
    await writeAudit(tx, {
      userId: actor.id,
      entityType: "Notification",
      recordId: changed.length === 1 ? changed[0].id : actor.id,
      recordName: changed.length === 1 ? "Notification" : `${changed.length} notifications`,
      action: "Updated",
      before: { read: false },
      after: { read: true, count: changed.length },
    });
    return changed.length;
  });
}
