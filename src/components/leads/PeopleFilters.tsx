import Link from "next/link";
import { Download, Search } from "lucide-react";
import { LEVELS, STAGES } from "@/lib/db/enums";
import type { PeopleFilters as Filters } from "@/server/leads/people";
import type { LeadFormOptions } from "@/server/leads/options";
import styles from "./leads.module.scss";

type Props = {
  filters: Filters;
  options: LeadFormOptions;
  markets: string[];
  exportHref: string;
};

/** A plain form: Apply puts the filters in the page address (bookmarkable). */
export function PeopleFilters({ filters, options, markets, exportHref }: Props) {
  const select = (
    name: string,
    label: string,
    value: string | undefined,
    items: { value: string; label: string }[],
    all: string,
  ) => (
    <label className={styles.filter}>
      <span>{label}</span>
      <select name={name} defaultValue={value ?? ""} className={styles.control}>
        <option value="">{all}</option>
        {items.map((i) => (
          <option key={i.value} value={i.value}>
            {i.label}
          </option>
        ))}
      </select>
    </label>
  );
  const fromChoices = (c: { id: string; label: string }[]) =>
    c.map((x) => ({ value: x.id, label: x.label }));
  const plain = (v: readonly string[]) => v.map((x) => ({ value: x, label: x }));

  return (
    <form className={styles.filters} method="get" action="/people">
      <input type="hidden" name="view" value={filters.mine ? "mine" : "all"} />
      <label className={`${styles.filter} ${styles.search}`}>
        <span>Search</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Name, title or company"
          className={styles.control}
        />
      </label>
      {!filters.mine &&
        select("owner", "Owner", filters.ownerId, fromChoices(options.owners), "Everyone")}
      {select(
        "persona",
        "Persona",
        filters.personaId,
        fromChoices(options.personas),
        "All personas",
      )}
      {select("level", "Level", filters.level, plain(LEVELS), "Any level")}
      {select(
        "filter",
        "Account filter",
        filters.accountFilterId,
        fromChoices(options.accountFilters),
        "All filters",
      )}
      {select("stage", "Stage", filters.stage, plain(STAGES), "All stages")}
      {select("market", "Market", filters.market, plain(markets), "All markets")}
      {select(
        "next",
        "Next action",
        filters.next,
        [
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Today" },
          { value: "week", label: "This week" },
        ],
        "Any date",
      )}
      <div className={styles.filterButtons}>
        <button type="submit" className={styles.apply}>
          <Search size={16} aria-hidden />
          Apply
        </button>
        <Link href={`/people?view=${filters.mine ? "mine" : "all"}`} className={styles.linkButton}>
          Clear
        </Link>
        <a href={exportHref} className={styles.linkButton} download>
          <Download size={16} aria-hidden />
          Export CSV
        </a>
      </div>
    </form>
  );
}
