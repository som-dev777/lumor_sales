import type { Metadata } from "next";
import { ComingSoon } from "@/components/shell/ComingSoon";
import { PageHeader } from "@/components/shell/PageHeader";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Invite people, change roles, deactivate and reactivate."
      />
      <ComingSoon feature="F01 Auth and users" release="R1 (v1.0.0)">
        Being built now, in R1 Step 8.
      </ComingSoon>
    </>
  );
}
