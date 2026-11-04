import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { FilterBar } from "@/components/leads/FilterBar";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { LEVELS, STAGES } from "@/lib/db/enums";
import { PeopleTable } from "@/components/leads/PeopleTable";
import { PersonDialogButton } from "@/components/leads/PersonDialogButton";
import styles from "@/components/leads/leads.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { PendingHint } from "@/components/ui/PendingHint";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { formatIstDate } from "@/lib/time";
import { appNow } from "@/lib/clock";
import { usablePlans } from "@/server/plans/plans";
import { backlogByPerson } from "@/server/today";
import { leadFormOptions } from "@/server/leads/options";
import {
  listPeople,
  marketChoices,
  PEOPLE_ACTIVITY,
  PEOPLE_SORTS,
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
  // Backlogs (D-043): the same rules as Today, for the badge and the "Backlog only" filter.
  const backlog = await backlogByPerson(db, await appNow());
  // "Overdue" from older links means the same as Backlog now (D-055).
  if (filters.next === "overdue") filters.next = "backlog";
  if (filters.next === "backlog" || filters.sort === "backlog") {
    filters.backlogIds = [...backlog.keys()];
  }
  const [{ rows, total }, options, markets, plans] = await Promise.all([
    listPeople(db, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    leadFormOptions(db),
    marketChoices(db),
    usablePlans(db, viewer),
  ]);
  const isAdmin = can(viewer, "lead.reassign");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const viewHref = (view: "mine" | "all") => `/people?view=${view}`;
  const plain = (v: readonly string[]) => v.map((x) => ({ value: x, label: x }));
  const choices = (c: { id: string; label: string }[]) =>
    c.map((x) => ({ value: x.id, label: x.label }));
  const filtered = Boolean(
    filters.q ||
    filters.personaId ||
    filters.level ||
    filters.accountFilterId ||
    filters.stage ||
    filters.market ||
    filters.next ||
    filters.activity ||
    filters.plan ||
    filters.ownerId,
  );

  return (
    <>
      <AutoRefresh everyMs={0} />
      <div className={styles.topRow}>
        <nav className={styles.toggle} aria-label="My leads or all leads">
          <Link
            href={viewHref("mine")}
            className={`${styles.toggleItem} ${filters.mine ? styles.toggleOn : ""}`}
            aria-current={filters.mine ? "page" : undefined}
          >
            My leads
            <PendingHint />
          </Link>
          <Link
            href={viewHref("all")}
            className={`${styles.toggleItem} ${!filters.mine ? styles.toggleOn : ""}`}
            aria-current={!filters.mine ? "page" : undefined}
          >
            All leads
            <PendingHint />
          </Link>
        </nav>
        <div className={styles.topActions}>
          <PersonDialogButton options={options} canChooseOwner={isAdmin} />
        </div>
      </div>
      <FilterBar
        action="/people"
        hidden={{ view: filters.mine ? "mine" : "all" }}
        search={{ value: filters.q, placeholder: "Name, title or company" }}
        sort={{ value: filters.sort ?? "name", defaultValue: "name", options: [...PEOPLE_SORTS] }}
        filters={[
          {
            name: "next",
            label: "Next action",
            value: filters.next,
            options: [
              { value: "backlog", label: "Backlog (late work)" },
              { value: "today", label: "Due today" },
              { value: "week", label: "Due this week" },
            ],
            all: "Any date",
          },
          {
            name: "activity",
            label: "Activity",
            value: filters.activity,
            options: [...PEOPLE_ACTIVITY],
            all: "Any activity",
          },
          {
            name: "stage",
            label: "Stage",
            value: filters.stage,
            options: plain(STAGES),
            all: "All stages",
          },
          {
            name: "plan",
            label: "Plan",
            value: filters.plan,
            options: [
              { value: "on", label: "On a plan" },
              { value: "off", label: "Not on a plan" },
            ],
            all: "On a plan or not",
          },
          ...(filters.mine
            ? []
            : [
                {
                  name: "owner",
                  label: "Owner",
                  value: filters.ownerId,
                  options: choices(options.owners),
                  all: "Everyone",
                },
              ]),
          {
            name: "persona",
            label: "Persona",
            value: filters.personaId,
            options: choices(options.personas),
            all: "All personas",
          },
          {
            name: "level",
            label: "Level",
            value: filters.level,
            options: plain(LEVELS),
            all: "Any level",
          },
          {
            name: "filter",
            label: "Account filter",
            value: filters.accountFilterId,
            options: choices(options.accountFilters),
            all: "All filters",
          },
          {
            name: "market",
            label: "Market",
            value: filters.market,
            options: plain(markets),
            all: "All markets",
          },
        ]}
        extra={
          <a
            href={`/people/export${peopleQueryString(filters)}`}
            className={styles.linkButton}
            download
          >
            <Download size={16} aria-hidden />
            Export CSV
          </a>
        }
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
            plans={plans}
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
              // Late only while it's still a backlog: anything logged since clears it (D-055).
              overdue: backlog.has(r.id),
              ownerName: r.ownerName,
              backlog: backlog.has(r.id)
                ? `Backlog · ${backlog.get(r.id)!.daysLate} day${backlog.get(r.id)!.daysLate === 1 ? "" : "s"}`
                : null,
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
