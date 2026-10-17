import type { Metadata } from "next";
import { Suspense } from "react";
import { AddItemButton } from "@/components/library/AddItemButton";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
import { ProposalStrip } from "@/components/library/ProposalStrip";
import { TemplateCard } from "@/components/library/TemplateCard";
import styles from "@/components/library/library.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { TEMPLATE_PURPOSES } from "@/lib/db/enums";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { myProposals } from "@/server/library/approvals";
import {
  latestDecisions,
  listTemplates,
  personaChoices,
  tabCounts,
  type LibraryTab,
} from "@/server/library/queries";
import { EMPTY_TEMPLATE_STATS, templateStats } from "@/server/library/stats";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage({ searchParams }: PageProps<"/templates">) {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Message templates grouped by purpose, with A/B/C versions. Times used and reply rate show which wording works."
      />
      <Suspense fallback={<StatusMessage title="Loading templates…" />}>
        <Templates searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Templates({ searchParams }: Pick<PageProps<"/templates">, "searchParams">) {
  const viewer = await requireUser();
  const params = await searchParams;
  const tab: LibraryTab = params.tab === "personal" ? "personal" : "official";
  const archived = params.archived === "1";
  const mine = params.mine === "1";
  const db = getDb();
  const listOptions = { includeArchived: archived, mineOnly: mine, viewerId: viewer.id };

  const [rows, counts, stats, proposals, personas] = await Promise.all([
    listTemplates(db, { ...listOptions, tab }),
    tabCounts(db, "template", listOptions),
    templateStats(db),
    myProposals(db, viewer.id, "template"),
    personaChoices(db),
  ]);
  const decisions = await latestDecisions(
    db,
    "template",
    rows.map((r) => r.id),
  );
  const createType = tab === "official" ? "Official" : "Personal";
  const canAdd = can(viewer, "library.create", { type: createType });
  // Sections in the PRD's purpose order; empty purposes are left out.
  const groups = TEMPLATE_PURPOSES.map((purpose) => ({
    purpose,
    items: rows.filter((r) => r.purpose === purpose),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <ProposalStrip proposals={proposals} />
      <LibraryToolbar
        basePath="/templates"
        tab={tab}
        counts={counts}
        archived={archived}
        mine={mine}
        action={
          canAdd ? (
            <AddItemButton kind="template" type={createType} formOptions={personas} />
          ) : undefined
        }
      />
      {groups.length === 0 ? (
        <StatusMessage
          title={tab === "official" ? "No Official templates yet" : "No Personal templates yet"}
        >
          <p>
            {tab === "official"
              ? "Admins add Official templates, or approve ones the team proposes."
              : "Create one with Add template, or duplicate an Official template to adapt its wording."}
          </p>
        </StatusMessage>
      ) : (
        groups.map((group) => (
          <section key={group.purpose} className={styles.section} aria-label={group.purpose}>
            <h2 className={styles.sectionTitle}>
              {group.purpose} <Badge>{group.items.length}</Badge>
            </h2>
            <div className={styles.grid}>
              {group.items.map((row) => (
                <TemplateCard
                  key={row.id}
                  row={row}
                  stats={stats.get(row.id) ?? EMPTY_TEMPLATE_STATS}
                  viewer={viewer}
                  decision={decisions.get(row.id)}
                  personas={personas}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}
