import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { countPendingProposals } from "@/server/library/approvals";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

/**
 * The sidebar for the signed-in user. Calling requireUser() here also protects every page
 * in the app: no session → /login, deactivated → /disabled, pending change → /change-password.
 */
export async function SignedInSidebar() {
  const viewer = await requireUser();
  // Admins see how many proposals are waiting (F07).
  const pending = can(viewer, "proposal.decide") ? await countPendingProposals(getDb()) : 0;
  return (
    <Sidebar
      role={viewer.role}
      footer={<UserMenu viewer={viewer} />}
      counts={{ "/approvals": pending }}
    />
  );
}
