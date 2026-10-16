import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Account Filters" };

export default function AccountFiltersPage() {
  return (
    <>
      <PageHeader
        title="Account Filters"
        description="Official and Personal account lists, with live stats."
      />
      <ComingSoon feature="F05 Account filters" release="R2 (v1.1.0)" />
    </>
  );
}
