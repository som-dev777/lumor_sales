import { Badge } from "@/components/ui/Badge";
import styles from "./library.module.scss";

type Props = {
  status: string;
  proposalStatus: string;
  decision?: { decision: string; note: string | null };
};

/** Archived / Proposed / Approved / Rejected labels, plus the Admin's note on a rejection. */
export function CardBadges({ status, proposalStatus, decision }: Props) {
  const badges = [];
  if (status === "Archived") badges.push(<Badge key="a">Archived</Badge>);
  if (proposalStatus === "Proposed")
    badges.push(
      <Badge key="p" tone="warning">
        Proposed
      </Badge>,
    );
  if (proposalStatus === "Approved")
    badges.push(
      <Badge key="ok" tone="success">
        Approved
      </Badge>,
    );
  if (proposalStatus === "Rejected")
    badges.push(
      <Badge key="r" tone="danger">
        Proposal rejected
      </Badge>,
    );
  return (
    <>
      {badges.length > 0 && <div className={styles.badges}>{badges}</div>}
      {proposalStatus === "Rejected" && decision?.note && (
        <p className={styles.note}>Admin&apos;s note: {decision.note}</p>
      )}
    </>
  );
}
