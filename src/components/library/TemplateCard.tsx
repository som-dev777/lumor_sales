import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { template } from "@/lib/db/schema";
import type { Actor } from "@/lib/permissions";
import type { TemplateInput } from "@/lib/validation/library";
import type { TemplateStats } from "@/server/library/stats";
import { CardBadges } from "./CardBadges";
import { ItemActions } from "./ItemActions";
import { itemPermissions } from "./permissions";
import { percent } from "./StatsRow";
import { TemplateBody } from "./TemplateBody";
import type { PersonaChoice } from "./TemplateForm";
import styles from "./library.module.scss";

type Row = typeof template.$inferSelect & { ownerName: string | null; personaName: string | null };

export function TemplateCard({
  row,
  stats,
  viewer,
  decision,
  personas,
}: {
  row: Row;
  stats: TemplateStats;
  viewer: Actor;
  decision?: { decision: string; note: string | null };
  personas: PersonaChoice[];
}) {
  const permissions = itemPermissions(viewer, row);
  const locked = row.type === "Official" && !permissions.canEdit;
  const editValues: TemplateInput = {
    name: row.name,
    purpose: row.purpose,
    personaId: row.personaId ?? "",
    level: row.level,
    version: row.version,
    body: row.body,
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
            <Badge tone="primary">Version {row.version}</Badge>
          </div>
          <p className={styles.owner}>
            {row.personaName ?? "Any persona"} · {row.level} · Revision {row.revision}
            {row.type === "Personal" && ` · Personal · ${row.ownerName ?? "Unknown"}`}
          </p>
        </div>
        <ItemActions
          kind="template"
          id={row.id}
          name={row.name}
          archived={row.status === "Archived"}
          permissions={permissions}
          editValues={editValues}
          formOptions={personas}
          hasRevisions={row.revision > 1}
        />
      </div>
      <CardBadges status={row.status} proposalStatus={row.proposalStatus} decision={decision} />
      <TemplateBody body={row.body} />
      <div className={styles.statsSmall}>
        <span>
          <strong>{stats.timesUsed}</strong> times used
        </span>
        <span>
          <strong>{percent(stats.replyRate)}</strong> reply rate
          {stats.messaged > 0 && ` (${stats.replied} of ${stats.messaged})`}
        </span>
      </div>
    </article>
  );
}
