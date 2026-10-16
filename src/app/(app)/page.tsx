import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <>
      <PageHeader title="Today" description="Your ranked list of what to do today." />
      <ComingSoon feature="F08 Today planner" release="R6 (v1.5.0)">
        Today will list replies waiting, demos, follow-ups due, requests to withdraw, your outreach
        target and stale leads, ranked by AI. It becomes the home page in R6.
      </ComingSoon>
    </>
  );
}
