import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { accountFilter } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import type { AccountFilterInput } from "@/lib/validation/library";
import type { ItemStats } from "@/server/library/stats";
import { CardBadges } from "./CardBadges";
import { ItemActions } from "./ItemActions";
import { itemPermissions } from "./permissions";
import { StatsRow } from "./StatsRow";
import styles from "./library.module.scss";

type Row = typeof accountFilter.$inferSelect & { ownerName: string | null };

export function AccountFilterCard({
  row,
  stats,
  viewer,
  decision,
}: {
  row: Row;
  stats: ItemStats;
  viewer: Actor;
  decision?: { decision: string; note: string | null };
}) {
  const permissions = itemPermissions(viewer, row);
  const locked = row.type === "Official" && !permissions.canEdit;
  const label = `${row.code} ${row.name}`;
  const editValues: AccountFilterInput = {
    code: row.code,
    name: row.name,
    industries: row.industries,
    companyHeadcount: row.companyHeadcount ?? "",
    hqLocations: row.hqLocations,
    keyFilters: row.keyFilters ?? "",
    exclusions: row.exclusions ?? "",
    keywords: row.keywords ?? "",
    whyItMatters: row.whyItMatters ?? "",
  };
  const field = (name: string, value: string | null | undefined) =>
    value ? (
      <>
        <dt>{name}</dt>
        <dd>{value}</dd>
      </>
    ) : null;

  return (
    <article
      className={`${styles.card} ${row.status === "Archived" ? styles.archived : ""}`}
      aria-label={label}
    >
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitle}>
            {locked && (
              <Lock
                size={14}
                className={styles.lock}
                aria-label="Official: only Admins can change it"
              />
            )}
            <Badge tone="primary">{row.code}</Badge>
            <h3 className={styles.cardName}>{row.name}</h3>
          </div>
          {row.type === "Personal" && (
            <p className={styles.owner}>Personal · {row.ownerName ?? "Unknown"}</p>
          )}
        </div>
        <ItemActions
          kind="accountFilter"
          id={row.id}
          name={label}
          archived={row.status === "Archived"}
          permissions={permissions}
          editValues={editValues}
        />
      </div>
      <CardBadges status={row.status} proposalStatus={row.proposalStatus} decision={decision} />
      <StatsRow stats={stats} />
      <dl className={styles.fields}>
        <dt>Industries</dt>
        <dd>{row.industries.length ? row.industries.join(", ") : "Any"}</dd>
        <dt>Headcount</dt>
        <dd>{row.companyHeadcount ?? "—"}</dd>
        <dt>HQ</dt>
        <dd>{row.hqLocations.length ? row.hqLocations.join(", ") : "Any"}</dd>
        {field("Key filters", row.keyFilters)}
        {field("Keywords", row.keywords)}
        {field("Exclusions", row.exclusions)}
        {field("Why it matters", row.whyItMatters)}
      </dl>
    </article>
  );
}
