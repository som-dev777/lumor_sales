import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import styles from "@/components/plans/plans.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { requireUser } from "@/lib/session";
import { listPlans, type PlanTab } from "@/server/plans/plans";

export const metadata: Metadata = { title: "Plans" };

export default function PlansPage({ searchParams }: PageProps<"/plans">) {
  return (
    <>
      <PageHeader
        title="Plans"
        description="The agreed way to pitch a person: ordered steps, each with a channel, a message or script, and a wait."
      />
      <Suspense fallback={<StatusMessage title="Loading plans…" />}>
        <Plans searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Plans({ searchParams }: Pick<PageProps<"/plans">, "searchParams">) {
  const viewer = await requireUser();
  const params = await searchParams;
  const raw = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const tabs: { key: PlanTab; label: string }[] = [
    { key: "official", label: "Official" },
    { key: "mine", label: "My plans" },
    ...(viewer.role === "Admin" ? [{ key: "all" as const, label: "All plans" }] : []),
  ];
  const tab = tabs.find((t) => t.key === raw)?.key ?? "official";
  const plans = await listPlans(getDb(), viewer, tab);

  return (
    <>
      <div className={styles.topRow}>
        <nav className={styles.tabs} aria-label="Which plans">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/plans?tab=${t.key}`}
              className={t.key === tab ? styles.tabActive : styles.tab}
              aria-current={t.key === tab ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <Link href="/plans/new" className={styles.linkButton}>
          <Plus size={16} aria-hidden /> New plan
        </Link>
      </div>
      {plans.length === 0 ? (
        <StatusMessage title={tab === "mine" ? "No plans of your own yet" : "No plans here yet"}>
          <p>Create one with New plan, or duplicate an Official plan to make it your own.</p>
        </StatusMessage>
      ) : (
        <div className={styles.grid}>
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/plans/${p.id}`}
              className={styles.planCard}
              aria-label={p.name}
            >
              <div className={styles.badges}>
                <Badge tone={p.type === "Official" ? "primary" : "neutral"}>{p.type}</Badge>
                <Badge tone="neutral">{p.planType}</Badge>
                {p.status === "Archived" && <Badge tone="warning">Archived</Badge>}
                {p.proposalStatus === "Proposed" && <Badge tone="warning">Proposed</Badge>}
              </div>
              <h2 className={styles.planTitle}>{p.name}</h2>
              <p className={styles.muted}>
                {p.steps} {p.steps === 1 ? "step" : "steps"} · version {p.currentVersion} ·{" "}
                {p.enrolled} enrolled
                {p.personaName ? ` · ${p.personaName}` : ""}
              </p>
              <p className={styles.muted}>Owner: {p.ownerName}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
