import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuditFilters } from "@/components/audit/AuditFilters";
import { AuditTable } from "@/components/audit/AuditTable";
import styles from "@/components/audit/audit.module.scss";
import { PageHeader } from "@/components/shell/PageHeader";
import { RequirePermission } from "@/components/shell/RequirePermission";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { summariseChanges } from "@/lib/audit-format";
import { getDb } from "@/lib/db/client";
import { formatIst } from "@/lib/time";
import { auditFilterOptions, parseAuditFilters, searchAuditLog } from "@/server/audit-query";
import { auditNameMap } from "@/server/audit-names";

export const metadata: Metadata = { title: "Audit Log" };

const PAGE_SIZE = 50;

export default function AuditLogPage({ searchParams }: PageProps<"/audit-log">) {
  return (
    <RequirePermission action="audit.view">
      <PageHeader
        title="Audit Log"
        description="Every change: who, when, and what it was before and after. Entries can't be edited or deleted, not even by an Admin."
      />
      <Suspense fallback={<StatusMessage title="Loading the Audit Log…" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </RequirePermission>
  );
}

async function Results({ searchParams }: Pick<PageProps<"/audit-log">, "searchParams">) {
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const page = Math.max(1, Number.parseInt(String(params.page ?? "1"), 10) || 1);
  const db = getDb();
  const [{ entries, total }, options] = await Promise.all([
    searchAuditLog(db, filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    auditFilterOptions(db),
  ]);

  const names = await auditNameMap(
    db,
    entries.map((e) => e.changes),
  );
  const query = toQuery(filters);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => `/audit-log${toQuery(filters, n)}`;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <AuditFilters
        filters={filters}
        users={options.users}
        entityTypes={options.entityTypes}
        query={query}
      />
      {total === 0 ? (
        <StatusMessage
          title={filtered ? "No entries match these filters" : "No changes recorded yet"}
        >
          {filtered && (
            <p>
              <Link href="/audit-log">Clear the filters</Link> to see everything.
            </p>
          )}
        </StatusMessage>
      ) : (
        <>
          <p className={styles.count}>
            Showing {first}–{last} of {total} {total === 1 ? "entry" : "entries"}, newest first.
          </p>
          <AuditTable
            names={names}
            rows={entries.map((e) => ({
              id: e.id,
              when: formatIst(e.occurredAt),
              who: e.userName ?? "System",
              action: e.action,
              entityType: e.entityType,
              recordName: e.recordName,
              summary: summariseChanges(e.changes, names),
              changes: e.changes,
            }))}
          />
          {pages > 1 && (
            <nav className={styles.pager} aria-label="Pages">
              <span>
                Page {page} of {pages}
              </span>
              <span className={styles.pagerLinks}>
                <Link
                  href={pageHref(page - 1)}
                  className={`${styles.linkButton} ${page <= 1 ? styles.disabled : ""}`}
                  aria-disabled={page <= 1}
                >
                  Newer
                </Link>
                <Link
                  href={pageHref(page + 1)}
                  className={`${styles.linkButton} ${page >= pages ? styles.disabled : ""}`}
                  aria-disabled={page >= pages}
                >
                  Older
                </Link>
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}

function toQuery(f: ReturnType<typeof parseAuditFilters>, page?: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.userId) p.set("user", f.userId);
  if (f.entityType) p.set("type", f.entityType);
  if (f.action) p.set("action", f.action);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (page && page > 1) p.set("page", String(page));
  const s = p.toString();
  return s ? `?${s}` : "";
}
