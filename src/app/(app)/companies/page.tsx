import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CompanyDialogButton } from "@/components/leads/CompanyDialogButton";
import styles from "@/components/leads/leads.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { getDb } from "@/lib/db/client";
import { COMPANY_STATUSES } from "@/lib/db/enums";
import { formatInr } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { appNow } from "@/lib/clock";
import {
  COMPANY_SHOWS,
  COMPANY_SORTS,
  listCompanies,
  parseCompanyFilters,
} from "@/server/leads/companies";
import { connection } from "next/server";
import { FilterBar } from "@/components/leads/FilterBar";
import { AutoRefresh } from "@/components/shell/AutoRefresh";
import { formatIst } from "@/lib/time";
import { backlogByCompany, backlogByPerson } from "@/server/today";
import { leadFormOptions } from "@/server/leads/options";

export const metadata: Metadata = { title: "Companies" };

const STATUS_TONE = {
  Target: "neutral",
  Engaged: "primary",
  Customer: "success",
  Lost: "danger",
} as const;

export default function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  return (
    <>
      <PageHeader
        title="Companies"
        description="Every company the team works with, its people, and the deal once they're a customer."
      />
      <Suspense fallback={<StatusMessage title="Loading companies…" />}>
        <Companies searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Companies({ searchParams }: Pick<PageProps<"/companies">, "searchParams">) {
  const viewer = await requireUser();
  await connection(); // "No activity in 30 days" and backlogs depend on the current date
  const filters = parseCompanyFilters(await searchParams);
  const db = getDb();
  const now = await appNow();
  const backlog = backlogByCompany(await backlogByPerson(db, now));
  const [rows, options] = await Promise.all([
    listCompanies(db, filters, { backlog, now }),
    leadFormOptions(db),
  ]);
  const { sort: _sort, ...narrowing } = filters;
  const filtered = Object.values(narrowing).some(Boolean);
  const plain = (v: readonly string[]) => v.map((x) => ({ value: x, label: x }));
  const choices = (c: { id: string; label: string }[]) =>
    c.map((x) => ({ value: x.id, label: x.label }));

  return (
    <>
      <AutoRefresh everyMs={0} />
      <div className={styles.topRow}>
        <span />
        <div className={styles.topActions}>
          <CompanyDialogButton options={options} canChooseOwner={can(viewer, "lead.reassign")} />
        </div>
      </div>
      <FilterBar
        action="/companies"
        search={{ value: filters.q, placeholder: "Search companies" }}
        sort={{ value: filters.sort ?? "name", defaultValue: "name", options: [...COMPANY_SORTS] }}
        filters={[
          {
            name: "show",
            label: "Needs action",
            value: filters.show,
            options: [...COMPANY_SHOWS],
            all: "All companies",
          },
          {
            name: "status",
            label: "Status",
            value: filters.status,
            options: plain(COMPANY_STATUSES),
            all: "All statuses",
          },
          {
            name: "owner",
            label: "Owner",
            value: filters.ownerId,
            options: choices(options.owners),
            all: "Everyone",
          },
          {
            name: "filter",
            label: "Account filter",
            value: filters.accountFilterId,
            options: choices(options.accountFilters),
            all: "All filters",
          },
        ]}
      />
      {rows.length === 0 ? (
        <StatusMessage title={filtered ? "No companies match these filters" : "No companies yet"}>
          <p>
            {filtered
              ? "Try clearing the filters."
              : "Companies are added when you add a person, or with Add company."}
          </p>
        </StatusMessage>
      ) : (
        <>
          <p className={styles.count}>
            {rows.length} {rows.length === 1 ? "company" : "companies"}
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col">Status</th>
                  <th scope="col">People</th>
                  <th scope="col">Backlog</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">Account filter</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Deal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/companies/${c.id}`} className={styles.name}>
                        {c.name}
                      </Link>
                      {c.city && <div className={styles.muted}>{c.city}</div>}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td>{c.people}</td>
                    <td>
                      {c.backlog ? (
                        <span
                          className={styles.backlogBadge}
                          title="People here with work from earlier days on Today"
                        >
                          {c.backlog} {c.backlog === 1 ? "person" : "people"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={styles.nowrap}>
                      {c.lastActivityAt ? formatIst(c.lastActivityAt, "d MMM yyyy") : "Never"}
                    </td>
                    <td>{c.accountFilterCode ?? "—"}</td>
                    <td>{c.ownerName ?? "—"}</td>
                    <td className={styles.nowrap}>
                      {c.dealValueInr !== null ? formatInr(c.dealValueInr) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
