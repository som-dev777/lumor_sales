import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Approvals" };

export default function ApprovalsPage() {
  return (
    <>
      <PageHeader
        title="Approvals"
        description="Personal items proposed as Official, waiting for an Admin."
      />
      <ComingSoon feature="F07 Approvals" release="R2 (v1.1.0)" />
    </>
  );
}
