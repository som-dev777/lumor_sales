import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { countPendingProposals } from "@/server/library/approvals";
import { unreadCount } from "@/server/notifications";
import { NotificationBell } from "./NotificationBell";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

/**
 * The sidebar for the signed-in user. Calling requireUser() here also protects every page
 * in the app: no session → /login, deactivated → /disabled, pending change → /change-password.
 */
export async function SignedInSidebar() {
  const viewer = await requireUser();
  // Admins see how many proposals are waiting (F07).
  const db = getDb();
  const [pending, unread] = await Promise.all([
    can(viewer, "proposal.decide") ? countPendingProposals(db) : 0,
    // New notifications (F25): on the bell and on Calendar.
    unreadCount(db, viewer.id),
  ]);
  return (
    <Sidebar
      role={viewer.role}
      footer={<UserMenu viewer={viewer} />}
      counts={{ "/approvals": pending, "/calendar": unread }}
      bell={<NotificationBell initialUnread={unread} />}
    />
  );
}
