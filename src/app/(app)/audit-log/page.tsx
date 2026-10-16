import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";

export const metadata: Metadata = { title: "Audit Log" };

export default function AuditLogPage() {
  return (
    <RequirePermission action="audit.view">
      <PageHeader
        title="Audit Log"
        description="Every change: who, when, and what it was before and after."
      />
      <ComingSoon feature="F14 Audit Log" release="R1 (v1.0.0)">
        Being built now, in R1 Step 9.
      </ComingSoon>
    </RequirePermission>
  );
}
