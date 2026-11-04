"use client";

import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import styles from "./filterBar.module.scss";

export type FilterOption = { value: string; label: string };
export type FilterDef = {
  name: string;
  label: string;
  value?: string;
  options: FilterOption[];
  /** The "no filter" choice, e.g. "All stages". */
  all: string;
};

type Props = {
  action: string;
  /** Kept in the address on every change (e.g. view=mine). */
  hidden?: Record<string, string>;
  search: { value?: string; placeholder: string };
  sort: { value: string; options: FilterOption[]; defaultValue: string };
  filters: FilterDef[];
  /** Extra buttons on the right (e.g. Export CSV). */
  extra?: ReactNode;
};

/**
 * The list toolbar (D-055): search, sort and a Filters button in one slim row. Filters open in a
 * panel; what's on shows as chips you can clear one by one. Every change applies at once and stays
 * in the page address, so a view can be bookmarked.
 */
export function FilterBar({ action, hidden = {}, search, sort, filters, extra }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const active = filters.filter((f) => f.value);
  const [open, setOpen] = useState(false);
  const apply = () => form.current?.requestSubmit();

  // The address without one setting, for a chip's ×.
  const without = (name: string) => {
    const p = new URLSearchParams(hidden);
    if (search.value && name !== "q") p.set("q", search.value);
    if (sort.value !== sort.defaultValue) p.set("sort", sort.value);
    for (const f of filters) if (f.value && f.name !== name) p.set(f.name, f.value);
    const q = p.toString();
    return q ? `${action}?${q}` : action;
  };
  const clearAll = () => {
    const p = new URLSearchParams(hidden);
    if (sort.value !== sort.defaultValue) p.set("sort", sort.value);
    const q = p.toString();
    return q ? `${action}?${q}` : action;
  };

  return (
    <Form ref={form} action={action} className={styles.bar} aria-label="Search, sort and filter">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className={styles.row}>
        <label className={styles.search}>
          <Search size={16} aria-hidden className={styles.icon} />
          <span className={styles.srOnly}>Search</span>
          <input
            // A new key when the address changes (a chip or Clear all), so the box shows it.
            key={search.value ?? ""}
            type="search"
            name="q"
            defaultValue={search.value}
            placeholder={search.placeholder}
            className={styles.input}
          />
        </label>
        <label className={styles.sort}>
          <ArrowUpDown size={16} aria-hidden className={styles.icon} />
          <span className={styles.srOnly}>Sort by</span>
          <select
            key={sort.value}
            name="sort"
            defaultValue={sort.value}
            className={styles.select}
            onChange={apply}
            aria-label="Sort by"
          >
            {sort.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`${styles.toggle} ${open || active.length ? styles.toggleOn : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal size={16} aria-hidden />
          Filters
          {active.length > 0 && <span className={styles.count}>{active.length}</span>}
        </button>
        <button type="submit" className={styles.srOnly}>
          Search
        </button>
        {extra && <div className={styles.extra}>{extra}</div>}
      </div>

      {/* Closed, the filters still travel with the form so a search keeps them. */}
      <div className={styles.panel} hidden={!open}>
        {filters.map((f) => (
          <label key={f.name} className={styles.field}>
            <span>{f.label}</span>
            <select
              key={f.value ?? ""}
              name={f.name}
              defaultValue={f.value ?? ""}
              className={styles.select}
              onChange={apply}
            >
              <option value="">{f.all}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {(active.length > 0 || search.value) && (
        <ul className={styles.chips} aria-label="Filters on">
          {search.value && (
            <li>
              <Link href={without("q")} className={styles.chip}>
                “{search.value}”
                <X size={14} aria-label="Clear the search" />
              </Link>
            </li>
          )}
          {active.map((f) => (
            <li key={f.name}>
              <Link href={without(f.name)} className={styles.chip}>
                {f.label}: {f.options.find((o) => o.value === f.value)?.label ?? f.value}
                <X size={14} aria-label={`Clear ${f.label}`} />
              </Link>
            </li>
          ))}
          <li>
            <Link href={clearAll()} className={styles.clear}>
              Clear all
            </Link>
          </li>
        </ul>
      )}
    </Form>
  );
}
