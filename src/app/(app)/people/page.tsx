import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PeopleFilters } from "@/components/leads/PeopleFilters";
import { PeopleTable } from "@/components/leads/PeopleTable";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import styles from "@/components/leads/leads.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate, todayIst } from "@/lib/time";
import { leadFormOptions } from "@/server/leads/options";
import {
  listPeople,
  marketChoices,
  parsePeopleFilters,
  peopleQueryString,
} from "@/server/leads/people";

export const metadata: Metadata = { title: "People" };

const PAGE_SIZE = 50;

export default function PeoplePage({ searchParams }: PageProps<"/people">) {
  return (
    <>
      <PageHeader
        title="People"
        description="Every lead, with owner, stage and next action. The same LinkedIn profile can never be added twice."
      />
      <Suspense fallback={<StatusMessage title="Loading people…" />}>
        <People searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function People({ searchParams }: Pick<PageProps<"/people">, "searchParams">) {
  const viewer = await requireUser();
  await connection(); // "Overdue" and "Today" depend on the current date
  const params = await searchParams;
  const filters = parsePeopleFilters(params, viewer);
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const db = getDb();
  const [{ rows, total }, options, markets] = await Promise.all([
    listPeople(db, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    leadFormOptions(db),
    marketChoices(db),
  ]);
  const isAdmin = can(viewer, "lead.reassign");
  const today = todayIst();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const viewHref = (view: "mine" | "all") => `/people?view=${view}`;
  const filtered = Boolean(
    filters.q ||
    filters.personaId ||
    filters.level ||
    filters.accountFilterId ||
    filters.stage ||
    filters.market ||
    filters.next ||
    filters.ownerId,
  );

  return (
    <>
      <div className={styles.topRow}>
        <nav className={styles.toggle} aria-label="My leads or all leads">
          <Link
            href={viewHref("mine")}
            className={`${styles.toggleItem} ${filters.mine ? styles.toggleOn : ""}`}
            aria-current={filters.mine ? "page" : undefined}
          >
            My leads
          </Link>
          <Link
            href={viewHref("all")}
            className={`${styles.toggleItem} ${!filters.mine ? styles.toggleOn : ""}`}
            aria-current={!filters.mine ? "page" : undefined}
          >
            All leads
          </Link>
        </nav>
        <div className={styles.topActions}>
          <PersonDialogButton options={options} canChooseOwner={isAdmin} />
        </div>
      </div>
      <PeopleFilters
        filters={filters}
        options={options}
        markets={markets}
        exportHref={`/people/export${peopleQueryString(filters)}`}
      />
      {total === 0 ? (
        <StatusMessage
          title={
            filtered
              ? "No leads match these filters"
              : filters.mine
                ? "You don't have any leads yet"
                : "No leads yet"
          }
        >
          <p>
            {filtered
              ? "Try clearing the filters."
              : "Click Add person and paste their LinkedIn profile link."}
          </p>
        </StatusMessage>
      ) : (
        <>
          <p className={styles.count}>
            {total} {total === 1 ? "lead" : "leads"}
            {pages > 1 ? ` · page ${page} of ${pages}` : ""}
          </p>
          <PeopleTable
            canReassign={isAdmin}
            owners={options.owners}
            rows={rows.map((r) => ({
              id: r.id,
              fullName: r.fullName,
              title: r.title,
              companyId: r.companyId,
              companyName: r.companyName,
              personaName: r.personaName,
              stage: r.stage,
              nextAction: r.nextAction,
              nextActionLabel: r.nextActionDate ? formatIstDate(r.nextActionDate) : null,
              overdue: Boolean(
                r.nextActionDate &&
                r.nextActionDate < today &&
                r.stage !== "Paid" &&
                r.stage !== "Lost",
              ),
              ownerName: r.ownerName,
            }))}
          />
          {pages > 1 && (
            <nav className={styles.pager} aria-label="Pages">
              <span>
                Page {page} of {pages}
              </span>
              <span className={styles.pagerLinks}>
                <Link
                  href={`/people${peopleQueryString(filters, { page: String(page - 1) })}`}
                  className={`${styles.linkButton} ${page <= 1 ? styles.disabled : ""}`}
                  aria-disabled={page <= 1}
                >
                  Previous
                </Link>
                <Link
                  href={`/people${peopleQueryString(filters, { page: String(page + 1) })}`}
                  className={`${styles.linkButton} ${page >= pages ? styles.disabled : ""}`}
                  aria-disabled={page >= pages}
                >
                  Next
                </Link>
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}
