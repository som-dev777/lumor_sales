import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Message templates by purpose, with versions and reply rates."
      />
      <ComingSoon feature="F06 Templates" release="R2 (v1.1.0)" />
    </>
  );
}
