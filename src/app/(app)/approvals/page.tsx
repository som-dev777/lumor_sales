import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <RequirePermission action="proposal.decide">
      <PageHeader
        title="Approvals"
        description="Personal items proposed as Official, waiting for an Admin."
      />
      <ComingSoon feature="F07 Approvals" release="R2 (v1.1.0)" />
    </RequirePermission>
  );
}
