import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "People" };

export default function PeoplePage() {
  return (
    <>
      <PageHeader
        title="People"
        description="Every lead, with filters, ownership and duplicate checks."
      />
      <ComingSoon feature="F02 People" release="R3 (v1.2.0)">
        Add leads with their public LinkedIn link. The same person can never be added twice.
      </ComingSoon>
    </>
  );
}
