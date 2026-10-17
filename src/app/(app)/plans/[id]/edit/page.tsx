import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlanBuilder } from "@/components/plans/PlanBuilder";
import styles from "@/components/plans/plans.module.scss";
import { NotAllowed } from "@/components/shell/NotAllowed";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { builderOptions } from "@/server/plans/builder-options";
import { getPlan } from "@/server/plans/plans";

export const metadata: Metadata = { title: "Edit plan" };

export default function EditPlanPage({ params }: PageProps<"/plans/[id]/edit">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Edit params={params} />
    </Suspense>
  );
}

async function Edit({ params }: Pick<PageProps<"/plans/[id]/edit">, "params">) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const p = await getPlan(db, viewer, id);
  if (!p) notFound();
  if (p === "forbidden" || !can(viewer, "plan.edit", p)) return <NotAllowed />;
  const options = await builderOptions(db);
  return (
    <>
      <p className={styles.muted}>
        <Link href={`/plans/${p.id}`}>← {p.name}</Link>
      </p>
      <PageHeader
        title={`Edit ${p.name}`}
        description={`Version ${p.currentVersion}. Changing the steps saves version ${p.currentVersion + 1}; people already enrolled keep theirs.`}
      />
      <PlanBuilder
        planId={p.id}
        canMakeOfficial={false}
        {...options}
        initial={{
          name: p.name,
          planType: p.planType,
          personaId: p.personaId ?? "",
          type: p.type,
          skipWeekends: p.skipWeekends,
          steps: p.steps.map((s) => ({
            channels: s.channels,
            templatePurpose: s.templatePurpose ?? "",
            templateId: s.templateId ?? "",
            script: s.script ?? "",
            waitDays: s.waitDays,
          })),
        }}
      />
    </>
  );
}
