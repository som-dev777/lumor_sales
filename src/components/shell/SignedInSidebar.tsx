import { requireUser } from "@/lib/session";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

/**
 * The sidebar for the signed-in user. Calling requireUser() here also protects every page
 * in the app: no session → /login, deactivated → /disabled, pending change → /change-password.
 */
export async function SignedInSidebar() {
  const viewer = await requireUser();
  return <Sidebar role={viewer.role} footer={<UserMenu viewer={viewer} />} />;
}
