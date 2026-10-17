import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
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
import { listCompanies } from "@/server/leads/companies";
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
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    const s = (Array.isArray(v) ? v[0] : v)?.trim();
    return s ? s.slice(0, 200) : undefined;
  };
  const filters = {
    q: one("q"),
    status: one("status"),
    ownerId: one("owner"),
    accountFilterId: one("filter"),
  };
  const db = getDb();
  const [rows, options] = await Promise.all([listCompanies(db, filters), leadFormOptions(db)]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <div className={styles.topRow}>
        <span />
        <div className={styles.topActions}>
          <CompanyDialogButton options={options} canChooseOwner={can(viewer, "lead.reassign")} />
        </div>
      </div>
      <form className={styles.filters} method="get" action="/companies">
        <label className={`${styles.filter} ${styles.search}`}>
          <span>Search</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Company name"
            className={styles.control}
          />
        </label>
        <label className={styles.filter}>
          <span>Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className={styles.control}>
            <option value="">All statuses</option>
            {COMPANY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filter}>
          <span>Owner</span>
          <select name="owner" defaultValue={filters.ownerId ?? ""} className={styles.control}>
            <option value="">Everyone</option>
            {options.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filter}>
          <span>Account filter</span>
          <select
            name="filter"
            defaultValue={filters.accountFilterId ?? ""}
            className={styles.control}
          >
            <option value="">All filters</option>
            {options.accountFilters.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.filterButtons}>
          <button type="submit" className={styles.apply}>
            <Search size={16} aria-hidden />
            Apply
          </button>
          <Link href="/companies" className={styles.linkButton}>
            Clear
          </Link>
        </div>
      </form>
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
