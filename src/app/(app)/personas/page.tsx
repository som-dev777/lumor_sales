import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Personas" };

export default function PersonasPage() {
  return (
    <>
      <PageHeader title="Personas" description="Official and Personal personas, with live stats." />
      <ComingSoon feature="F04 Personas" release="R2 (v1.1.0)" />
    </>
  );
}
