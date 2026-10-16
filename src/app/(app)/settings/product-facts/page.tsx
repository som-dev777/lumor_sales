import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Product Facts" };

export default function ProductFactsPage() {
  return (
    <>
      <PageHeader title="Product Facts" description="The only facts the AI may use about Lumor." />
      <ComingSoon feature="F12 Product Facts" release="R5 (v1.4.0)" />
    </>
  );
}
