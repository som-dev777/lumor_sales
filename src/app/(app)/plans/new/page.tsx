import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlanBuilder } from "@/components/plans/PlanBuilder";
import styles from "@/components/plans/plans.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { builderOptions } from "@/server/plans/builder-options";

export const metadata: Metadata = { title: "New plan" };

export default function NewPlanPage() {
  return (
    <>
      <p className={styles.muted}>
        <Link href="/plans">← Plans</Link>
      </p>
      <PageHeader
        title="New plan"
        description="Add the steps in order. Guardrails are checked as you go."
      />
      <Suspense fallback={<StatusMessage title="Loading…" />}>
        <Builder />
      </Suspense>
    </>
  );
}

async function Builder() {
  const viewer = await requireUser();
  const options = await builderOptions(getDb());
  const canMakeOfficial = can(viewer, "plan.create", { type: "Official" });
  return (
    <PlanBuilder
      planId={null}
      canMakeOfficial={canMakeOfficial}
      {...options}
      initial={{
        name: "",
        planType: "Outreach",
        personaId: "",
        type: canMakeOfficial ? "Official" : "Personal",
        skipWeekends: true,
        steps: [
          {
            channels: [{ channel: "LinkedIn connection request", when: "always" }],
            templatePurpose: "",
            templateId: "",
            script: "",
            waitDays: 0,
          },
          {
            channels: [{ channel: "LinkedIn message", when: "always" }],
            templatePurpose: "Message 1",
            templateId: "",
            script: "",
            waitDays: 2,
          },
        ],
      }}
    />
  );
}
