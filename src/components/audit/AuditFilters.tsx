import Link from "next/link";
import { Download, Search } from "lucide-react";
import { AUDIT_ACTIONS } from "@/lib/db/enums";
import type { AuditFilters as Filters } from "@/server/audit-query";
import styles from "./audit.module.scss";

type Props = {
  filters: Filters;
  users: { id: string; name: string }[];
  entityTypes: string[];
  /** The current filters as "?q=…&…", for the export link. */
  query: string;
};

/**
 * A plain form: Apply puts the filters in the page address, so a filtered view can be
 * bookmarked or shared, and Export CSV downloads exactly what's shown.
 */
export function AuditFilters({ filters, users, entityTypes, query }: Props) {
  return (
    <form className={styles.filters} method="get" action="/audit-log">
      <label className={`${styles.filter} ${styles.search}`}>
        <span>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Name, email, record or value"
          className={styles.control}
        />
      </label>
      <label className={styles.filter}>
        <span>User</span>
        <select name="user" defaultValue={filters.userId ?? ""} className={styles.control}>
          <option value="">Everyone</option>
          <option value="system">System</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filter}>
        <span>Type</span>
        <select name="type" defaultValue={filters.entityType ?? ""} className={styles.control}>
          <option value="">All types</option>
          {entityTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filter}>
        <span>Action</span>
        <select name="action" defaultValue={filters.action ?? ""} className={styles.control}>
          <option value="">All actions</option>
          {AUDIT_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filter}>
        <span>From</span>
        <input type="date" name="from" defaultValue={filters.from} className={styles.control} />
      </label>
      <label className={styles.filter}>
        <span>To</span>
        <input type="date" name="to" defaultValue={filters.to} className={styles.control} />
      </label>
      <div className={styles.filterButtons}>
        <button type="submit" className={styles.apply}>
          <Search size={16} aria-hidden />
          Apply
        </button>
        <Link href="/audit-log" className={styles.linkButton}>
          Clear
        </Link>
        <a href={`/audit-log/export${query}`} className={styles.linkButton} download>
          <Download size={16} aria-hidden />
          Export CSV
        </a>
      </div>
    </form>
  );
}
