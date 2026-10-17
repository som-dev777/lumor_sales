import { Badge } from "@/components/ui/Badge";
import { formatIst } from "@/lib/time";
import type { ProposalView } from "@/server/library/approvals";
import styles from "./library.module.scss";

const TONE = { Pending: "warning", Approved: "success", Rejected: "danger" } as const;

/** "Your proposals": the signed-in person's recent proposals of this kind, with outcomes (F07). */
export function ProposalStrip({ proposals }: { proposals: ProposalView[] }) {
  if (proposals.length === 0) return null;
  return (
    <section className={styles.strip} aria-label="Your proposals">
      <h2 className={styles.stripTitle}>Your proposals</h2>
      <ul className={styles.stripList}>
        {proposals.map((p) => (
          <li key={p.id}>
            <Badge tone={TONE[p.decision]}>
              {p.decision === "Pending" ? "Waiting for an Admin" : p.decision}
            </Badge>
            <strong>{p.itemName}</strong>
            <span className={styles.owner}>
              proposed {formatIst(p.proposedAt)}
              {p.decidedByName && p.decidedAt
                ? ` · ${p.decision.toLowerCase()} by ${p.decidedByName}`
                : ""}
            </span>
            {p.reviewerNote && <span className={styles.owner}>“{p.reviewerNote}”</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
