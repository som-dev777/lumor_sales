import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { persona } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import type { ItemStats } from "@/server/library/stats";
import { CardBadges } from "./CardBadges";
import { ItemActions } from "./ItemActions";
import { itemPermissions } from "./permissions";
import type { PersonaInput } from "@/lib/validation/library";
import { StatsRow } from "./StatsRow";
import styles from "./library.module.scss";

type Row = typeof persona.$inferSelect & { ownerName: string | null };

const list = (items: string[]) => (items.length ? items.join(", ") : "—");

export function PersonaCard({
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
  const editValues: PersonaInput = {
    name: row.name,
    tier: row.tier as 1 | 2 | 3,
    functions: row.functions as PersonaInput["functions"],
    seniority: row.seniority as PersonaInput["seniority"],
    jobTitles: row.jobTitles,
    geography: row.geography,
    whoItCovers: row.whoItCovers ?? "",
    toolsUsedToday: row.toolsUsedToday ?? "",
    leadWithAngle: row.leadWithAngle ?? "",
    notes: row.notes ?? "",
  };

  return (
    <article
      className={`${styles.card} ${row.status === "Archived" ? styles.archived : ""}`}
      aria-label={row.name}
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
            <h3 className={styles.cardName}>{row.name}</h3>
            <Badge tone={row.tier === 1 ? "primary" : "neutral"}>Tier {row.tier}</Badge>
          </div>
          {row.type === "Personal" && (
            <p className={styles.owner}>Personal · {row.ownerName ?? "Unknown"}</p>
          )}
        </div>
        <ItemActions
          kind="persona"
          id={row.id}
          name={row.name}
          archived={row.status === "Archived"}
          permissions={permissions}
          editValues={editValues}
        />
      </div>
      <CardBadges status={row.status} proposalStatus={row.proposalStatus} decision={decision} />
      <StatsRow stats={stats} />
      <dl className={styles.fields}>
        <dt>Function</dt>
        <dd>{list(row.functions)}</dd>
        <dt>Seniority</dt>
        <dd>{list(row.seniority)}</dd>
        <dt>Job titles</dt>
        <dd>{list(row.jobTitles)}</dd>
        <dt>Geography</dt>
        <dd>{list(row.geography)}</dd>
        {row.whoItCovers && (
          <>
            <dt>Who it covers</dt>
            <dd>{row.whoItCovers}</dd>
          </>
        )}
        <dt>Uses today</dt>
        <dd>{row.toolsUsedToday ?? "—"}</dd>
        <dt>Lead with</dt>
        <dd>{row.leadWithAngle ?? "—"}</dd>
        {row.notes && (
          <>
            <dt>Notes</dt>
            <dd>{row.notes}</dd>
          </>
        )}
      </dl>
    </article>
  );
}
