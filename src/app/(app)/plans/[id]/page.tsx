import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChangeHistory } from "@/components/audit/ChangeHistory";
import { PlanActions } from "@/components/plans/PlanActions";
import styles from "@/components/plans/plans.module.scss";
import { NotAllowed } from "@/components/shell/NotAllowed";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { describeChannels, describeWait } from "@/lib/plan-format";
import { requireUser } from "@/lib/session";
import { getPlan } from "@/server/plans/plans";

export const metadata: Metadata = { title: "Plan" };

export default function PlanPage({ params }: PageProps<"/plans/[id]">) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Plan params={params} />
    </Suspense>
  );
}

async function Plan({ params }: Pick<PageProps<"/plans/[id]">, "params">) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const p = await getPlan(getDb(), viewer, id);
  if (!p) notFound();
  if (p === "forbidden") return <NotAllowed />;

  return (
    <>
      <p className={styles.muted}>
        <Link href="/plans">← Plans</Link>
      </p>
      <section className={styles.card} aria-label={p.name}>
        <div className={styles.topRow}>
          <div>
            <div className={styles.badges}>
              <Badge tone={p.type === "Official" ? "primary" : "neutral"}>{p.type}</Badge>
              <Badge tone="neutral">{p.planType}</Badge>
              {p.status === "Archived" && <Badge tone="warning">Archived</Badge>}
              {p.proposalStatus === "Proposed" && <Badge tone="warning">Proposed</Badge>}
            </div>
            <h1 className={styles.planTitle}>{p.name}</h1>
            <p className={styles.muted}>
              Version {p.currentVersion} · {p.enrolled} enrolled · Skip weekends:{" "}
              {p.skipWeekends ? "on" : "off"} · Owner: {p.ownerName}
              {p.personaName ? ` · ${p.personaName}` : ""}
            </p>
          </div>
          <PlanActions
            planId={p.id}
            archived={p.status === "Archived"}
            canEdit={can(viewer, "plan.edit", p)}
            canPropose={can(viewer, "plan.propose", p) && p.proposalStatus !== "Proposed"}
            canDecide={can(viewer, "proposal.decide") && p.pendingProposal !== null}
          />
        </div>
      </section>

      <section className={styles.card} aria-label="Steps">
        <h2 className={styles.stepTitle}>Steps</h2>
        <ol className={styles.steps}>
          {p.steps.map((s, i) => (
            <li key={s.id} className={styles.step}>
              <span className={styles.stepNumber}>{s.stepOrder}</span>
              <div className={styles.stepMain}>
                <strong>{describeChannels(s)}</strong>
                <span className={styles.muted}>
                  {describeWait(p.steps, i)}
                  {s.templatePurpose ? ` · template: ${s.templatePurpose}` : ""}
                </span>
                {s.script && <p className={styles.script}>{s.script}</p>}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.card} aria-label="Guardrails">
        <h2 className={styles.stepTitle}>Cadence guardrails</h2>
        {p.findings.length === 0 ? (
          <p className={styles.ok}>This plan follows every guardrail.</p>
        ) : (
          <ul className={styles.findings}>
            {p.findings.map((f, k) => (
              <li key={k} className={f.level === "block" ? styles.block : styles.warn}>
                {f.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card}>
        <Suspense fallback={<StatusMessage title="Loading history…" />}>
          <ChangeHistory entityType="Plan" recordId={p.id} />
        </Suspense>
      </section>
    </>
  );
}
