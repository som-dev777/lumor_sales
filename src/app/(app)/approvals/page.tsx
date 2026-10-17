import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ProposalActions } from "@/components/approvals/ProposalActions";
import { ProposalPreview } from "@/components/approvals/ProposalPreview";
import styles from "@/components/approvals/approvals.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { formatIst } from "@/lib/time";
import {
  listPendingPlanProposals,
  listPendingProposals,
  listRecentDecisions,
} from "@/server/library/approvals";

export const metadata: Metadata = { title: "Approvals" };

const KIND_TITLE = {
  persona: "Persona",
  accountFilter: "Account filter",
  template: "Template",
} as const;

export default function ApprovalsPage() {
  return (
    <RequirePermission action="proposal.decide">
      <PageHeader
        title="Approvals"
        description="Personal personas, account filters, templates and plans the team has proposed as Official. Oldest first."
      />
      <Suspense fallback={<StatusMessage title="Loading proposals…" />}>
        <Queue />
      </Suspense>
    </RequirePermission>
  );
}

async function Queue() {
  const db = getDb();
  const [pending, decided, plans] = await Promise.all([
    listPendingProposals(db),
    listRecentDecisions(db, 20),
    listPendingPlanProposals(db),
  ]);

  return (
    <>
      {plans.length > 0 && (
        <section aria-label="Plans waiting" className={styles.planQueue}>
          <h2 className={styles.sectionTitle}>Plans waiting</h2>
          <ul className={styles.decided}>
            {plans.map((p) => (
              <li key={p.id}>
                <Badge tone="primary">Plan</Badge>
                <Link href={`/plans/${p.planId}`}>{p.planName}</Link>
                <span className={styles.muted}>
                  {p.planType} · proposed by {p.proposedByName} · {formatIst(p.proposedAt)}. Open it
                  to review the steps and approve or reject.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pending.length === 0 && plans.length === 0 ? (
        <StatusMessage title="Nothing waiting">
          <p>When someone proposes a Personal item as Official, it appears here.</p>
        </StatusMessage>
      ) : pending.length === 0 ? null : (
        <ol className={styles.list} aria-label="Waiting for a decision">
          {pending.map((p) => (
            <li key={p.id} className={styles.card} aria-label={p.itemName}>
              <div className={styles.header}>
                <div>
                  <h2 className={styles.title}>
                    <Badge tone="primary">{KIND_TITLE[p.kind]}</Badge>
                    {p.itemName}
                  </h2>
                  <p className={styles.muted}>
                    Proposed by {p.proposedByName} · {formatIst(p.proposedAt)}
                  </p>
                </div>
                {p.item && <ProposalActions proposalId={p.id} itemName={p.itemName} />}
              </div>
              <ProposalPreview proposal={p} />
            </li>
          ))}
        </ol>
      )}

      <h2 className={styles.sectionTitle}>Recently decided</h2>
      {decided.length === 0 ? (
        <p className={styles.muted}>No decisions yet.</p>
      ) : (
        <ul className={styles.decided}>
          {decided.map((d) => (
            <li key={d.id}>
              <Badge tone={d.decision === "Approved" ? "success" : "danger"}>{d.decision}</Badge>
              <strong>{d.itemName}</strong>
              <span className={styles.muted}>
                {KIND_TITLE[d.kind]} · proposed by {d.proposedByName}
                {d.decidedByName && ` · ${d.decision.toLowerCase()} by ${d.decidedByName}`}
                {d.decidedAt && ` · ${formatIst(d.decidedAt)}`}
              </span>
              {d.reviewerNote && <span className={styles.muted}>“{d.reviewerNote}”</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
