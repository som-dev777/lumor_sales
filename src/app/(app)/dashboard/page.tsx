import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Weekly and monthly funnel, with benchmarks and breakdowns."
      />
      <ComingSoon feature="F11 Dashboard" release="R4 (v1.3.0)" />
    </>
  );
}
