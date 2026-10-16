import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <PageHeader title="About" description="The app's version and latest releases." />
      <ComingSoon feature="F16 About and releases" release="R1 (v1.0.0)">
        Being built now, in R1 Step 10.
      </ComingSoon>
    </>
  );
}
