import type { Metadata } from "next";
import { Suspense } from "react";
import { AddItemButton } from "@/components/library/AddItemButton";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
import { PersonaCard } from "@/components/library/PersonaCard";
import { ProposalStrip } from "@/components/library/ProposalStrip";
import styles from "@/components/library/library.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { myProposals } from "@/server/library/approvals";
import {
  latestDecisions,
  listPersonas,
  personaOptions,
  tabCounts,
  type LibraryTab,
} from "@/server/library/queries";
import { EMPTY_STATS, leadStats } from "@/server/library/stats";

export const metadata: Metadata = { title: "Personas" };

export default function PersonasPage({ searchParams }: PageProps<"/personas">) {
  return (
    <>
      <PageHeader
        title="Personas"
        description="Who the team targets: titles, tools they use today, and what to lead with. Live stats show which ones convert."
      />
      <Suspense fallback={<StatusMessage title="Loading personas…" />}>
        <Personas searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Personas({ searchParams }: Pick<PageProps<"/personas">, "searchParams">) {
  const viewer = await requireUser();
  const params = await searchParams;
  const tab: LibraryTab = params.tab === "personal" ? "personal" : "official";
  const archived = params.archived === "1";
  const mine = params.mine === "1";
  const db = getDb();
  const listOptions = { includeArchived: archived, mineOnly: mine, viewerId: viewer.id };

  const [rows, counts, stats, proposals, options] = await Promise.all([
    listPersonas(db, { ...listOptions, tab }),
    tabCounts(db, "persona", listOptions),
    leadStats(db, "persona"),
    myProposals(db, viewer.id, "persona"),
    personaOptions(db),
  ]);
  const decisions = await latestDecisions(
    db,
    "persona",
    rows.map((r) => r.id),
  );
  const createType = tab === "official" ? "Official" : "Personal";
  const canAdd = can(viewer, "library.create", { type: createType });

  return (
    <>
      <ProposalStrip proposals={proposals} />
      <LibraryToolbar
        basePath="/personas"
        tab={tab}
        counts={counts}
        archived={archived}
        mine={mine}
        action={
          canAdd ? (
            <AddItemButton kind="persona" type={createType} formOptions={options} />
          ) : undefined
        }
      />
      {rows.length === 0 ? (
        <StatusMessage
          title={tab === "official" ? "No Official personas yet" : "No Personal personas yet"}
        >
          <p>
            {tab === "official"
              ? "Admins add Official personas, or approve ones the team proposes."
              : "Create one with Add persona, or duplicate an Official persona to adapt it."}
          </p>
        </StatusMessage>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => (
            <PersonaCard
              key={row.id}
              row={row}
              stats={stats.get(row.id) ?? EMPTY_STATS}
              viewer={viewer}
              decision={decisions.get(row.id)}
              options={options}
            />
          ))}
        </div>
      )}
    </>
  );
}
