import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { IndustryList } from "@/components/settings/IndustryList";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { listIndustries } from "@/server/industries";

export const metadata: Metadata = { title: "Industries" };

export default function IndustriesPage() {
  return (
    <>
      <p>
        <Link href="/settings">← Settings</Link>
      </p>
      <PageHeader
        title="Industries"
        description="The list used for companies and account filters. Anyone can add one; Admins rename or delete, and companies and account filters follow."
      />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Industries />
      </Suspense>
    </>
  );
}

async function Industries() {
  const viewer = await requireUser();
  await connection();
  const rows = await listIndustries(getDb());
  return <IndustryList rows={rows} canManage={can(viewer, "settings.edit")} />;
}
