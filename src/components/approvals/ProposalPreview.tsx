import { TemplateBody } from "@/components/library/TemplateBody";
import type { ProposalView } from "@/server/library/approvals";
import styles from "./approvals.module.scss";

const list = (items: string[]) => (items.length ? items.join(", ") : "—");

/** The proposed item's main fields, so an Admin can decide without leaving the page. */
export function ProposalPreview({ proposal }: { proposal: ProposalView }) {
  const item = proposal.item;
  if (!item) return <p className={styles.muted}>This item no longer exists.</p>;

  if ("tier" in item) {
    return (
      <dl className={styles.fields}>
        <dt>Tier</dt>
        <dd>{item.tier}</dd>
        <dt>Function</dt>
        <dd>{list(item.functions)}</dd>
        <dt>Seniority</dt>
        <dd>{list(item.seniority)}</dd>
        <dt>Job titles</dt>
        <dd>{list(item.jobTitles)}</dd>
        <dt>Uses today</dt>
        <dd>{item.toolsUsedToday ?? "—"}</dd>
        <dt>Lead with</dt>
        <dd>{item.leadWithAngle ?? "—"}</dd>
      </dl>
    );
  }
  if ("code" in item) {
    return (
      <dl className={styles.fields}>
        <dt>Code</dt>
        <dd>{item.code}</dd>
        <dt>Industries</dt>
        <dd>{item.industries.length ? item.industries.join(", ") : "Any"}</dd>
        <dt>Headcount</dt>
        <dd>{item.companyHeadcount ?? "—"}</dd>
        <dt>HQ</dt>
        <dd>{item.hqLocations.length ? item.hqLocations.join(", ") : "Any"}</dd>
        <dt>Key filters</dt>
        <dd>{item.keyFilters ?? "—"}</dd>
      </dl>
    );
  }
  return (
    <>
      <dl className={styles.fields}>
        <dt>Purpose</dt>
        <dd>{item.purpose}</dd>
        <dt>Version</dt>
        <dd>
          {item.version} · {item.level}
        </dd>
      </dl>
      <TemplateBody body={item.body} />
    </>
  );
}
