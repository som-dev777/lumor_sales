import { redirect } from "next/navigation";

/** Approvals were retired in 2.7.0 (D-043): anyone creates Official items. */
export default function ApprovalsPage() {
  redirect("/plans");
}
