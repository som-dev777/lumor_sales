import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { appNow } from "@/lib/clock";
import { meetingsToday } from "@/server/calendar";
import { listNotifications, unreadCount } from "@/server/notifications";
import { NotificationBell } from "./NotificationBell";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

/**
 * The sidebar for the signed-in user. Calling requireUser() here also protects every page
 * in the app: no session → /login, deactivated → /disabled, pending change → /change-password.
 */
export async function SignedInSidebar() {
  const viewer = await requireUser();
  const db = getDb();
  const now = await appNow();
  const [unread, latest, meetings] = await Promise.all([
    // New notifications (F25): on the bell only.
    unreadCount(db, viewer.id),
    listNotifications(db, viewer.id),
    // Calendar shows how many meetings you have today (D-045).
    meetingsToday(db, viewer.id, now),
  ]);
  return (
    <Sidebar
      role={viewer.role}
      footer={<UserMenu viewer={viewer} />}
      counts={{ "/calendar": meetings.length }}
      bell={<NotificationBell initialUnread={unread} initialItems={latest} />}
    />
  );
}
