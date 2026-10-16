import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Playbook Settings" };

export default function PlaybookPage() {
  return (
    <>
      <PageHeader title="Playbook Settings" description="Follow-up delays and daily targets." />
      <ComingSoon feature="F13 Playbook Settings" release="R5 (v1.4.0)" />
    </>
  );
}
