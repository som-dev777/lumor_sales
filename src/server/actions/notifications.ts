"use server";

// Notifications (F25): read your own, mark them read (audited). requireUser() first; the
// server functions only ever touch the signed-in rep's notifications.
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { PermissionError } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { listNotifications, markRead, unreadCount, type NotificationView } from "../notifications";

export async function myNotifications(): Promise<{
  unread: number;
  items: NotificationView[];
}> {
  const viewer = await requireUser();
  const db = getDb();
  const [unread, items] = await Promise.all([
    unreadCount(db, viewer.id),
    listNotifications(db, viewer.id),
  ]);
  return { unread, items };
}

export async function myUnreadCount(): Promise<number> {
  const viewer = await requireUser();
  return unreadCount(getDb(), viewer.id);
}

const ids = z.array(z.uuid()).max(100).nullable();

export async function markNotificationsRead(
  which: string[] | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await requireUser();
  const parsed = ids.safeParse(which);
  if (!parsed.success) return { ok: false, error: "Unknown notification." };
  try {
    await markRead(getDb(), viewer, parsed.data);
    return { ok: true };
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't update. Please try again." };
  }
}
