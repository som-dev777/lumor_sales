import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
  return (
    <>
      <PageHeader title="Companies" description="Every company, its people, timeline and deal." />
      <ComingSoon feature="F03 Companies" release="R3 (v1.2.0)" />
    </>
  );
}
