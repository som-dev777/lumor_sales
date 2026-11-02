import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
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
  const [unread, latest] = await Promise.all([
    // New notifications (F25): on the bell and on Calendar.
    unreadCount(db, viewer.id),
    listNotifications(db, viewer.id),
  ]);
  return (
    <Sidebar
      role={viewer.role}
      footer={<UserMenu viewer={viewer} />}
      counts={{ "/calendar": unread }}
      bell={<NotificationBell initialUnread={unread} initialItems={latest} />}
    />
  );
}
