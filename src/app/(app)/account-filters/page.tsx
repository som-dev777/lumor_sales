import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountFilterCard } from "@/components/library/AccountFilterCard";
import { AddItemButton } from "@/components/library/AddItemButton";
import { LibraryToolbar } from "@/components/library/LibraryToolbar";
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
  listAccountFilters,
  tabCounts,
  type LibraryTab,
} from "@/server/library/queries";
import { EMPTY_STATS, leadStats } from "@/server/library/stats";

export const metadata: Metadata = { title: "Account Filters" };

export default function AccountFiltersPage({ searchParams }: PageProps<"/account-filters">) {
  return (
    <>
      <PageHeader
        title="Account Filters"
        description="Saved Sales Navigator account searches: which companies to look at and why. Live stats show which lists convert."
      />
      <Suspense fallback={<StatusMessage title="Loading account filters…" />}>
        <AccountFilters searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AccountFilters({
  searchParams,
}: Pick<PageProps<"/account-filters">, "searchParams">) {
  const viewer = await requireUser();
  const params = await searchParams;
  const tab: LibraryTab = params.tab === "personal" ? "personal" : "official";
  const archived = params.archived === "1";
  const mine = params.mine === "1";
  const db = getDb();
  const listOptions = { includeArchived: archived, mineOnly: mine, viewerId: viewer.id };

  const [rows, counts, stats, proposals] = await Promise.all([
    listAccountFilters(db, { ...listOptions, tab }),
    tabCounts(db, "accountFilter", listOptions),
    leadStats(db, "accountFilter"),
    myProposals(db, viewer.id, "accountFilter"),
  ]);
  const decisions = await latestDecisions(
    db,
    "accountFilter",
    rows.map((r) => r.id),
  );
  const createType = tab === "official" ? "Official" : "Personal";
  const canAdd = can(viewer, "library.create", { type: createType });

  return (
    <>
      <ProposalStrip proposals={proposals} />
      <LibraryToolbar
        basePath="/account-filters"
        tab={tab}
        counts={counts}
        archived={archived}
        mine={mine}
        action={canAdd ? <AddItemButton kind="accountFilter" type={createType} /> : undefined}
      />
      {rows.length === 0 ? (
        <StatusMessage
          title={
            tab === "official"
              ? "No Official account filters yet"
              : "No Personal account filters yet"
          }
        >
          <p>
            {tab === "official"
              ? "Admins add Official account filters, or approve ones the team proposes."
              : "Create one with Add account filter, or duplicate an Official one to adapt it."}
          </p>
        </StatusMessage>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => (
            <AccountFilterCard
              key={row.id}
              row={row}
              stats={stats.get(row.id) ?? EMPTY_STATS}
              viewer={viewer}
              decision={decisions.get(row.id)}
            />
          ))}
        </div>
      )}
    </>
  );
}
