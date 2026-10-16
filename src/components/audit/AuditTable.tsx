"use client";

import {
  createColumnHelper,
  rowExpandingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Badge } from "@/components/ui/Badge";
import type { AuditChanges } from "@/lib/db/schema";
import { ChangeDetails } from "./ChangeDetails";
import styles from "./audit.module.scss";

export type AuditRow = {
  id: string;
  when: string;
  who: string;
  action: string;
  entityType: string;
  recordName: string;
  summary: string;
  changes: AuditChanges;
};

const features = tableFeatures({ rowExpandingFeature });
const column = createColumnHelper<typeof features, AuditRow>();

const ACTION_TONE: Record<string, "neutral" | "primary" | "success" | "danger" | "warning"> = {
  Created: "success",
  Updated: "neutral",
  Deleted: "danger",
  Approved: "success",
  Rejected: "danger",
  Reassigned: "primary",
  "Role changed": "primary",
  Deactivated: "danger",
  Reactivated: "success",
};

const columns = column.columns([
  column.display({
    id: "expand",
    header: () => <span className={styles.srOnly}>Details</span>,
    cell: ({ row }) => (
      <button
        type="button"
        className={styles.expand}
        aria-expanded={row.getIsExpanded()}
        aria-label={row.getIsExpanded() ? "Hide details" : "Show details"}
        onClick={() => row.toggleExpanded()}
      >
        {row.getIsExpanded() ? (
          <ChevronDown size={16} aria-hidden />
        ) : (
          <ChevronRight size={16} aria-hidden />
        )}
      </button>
    ),
  }),
  column.accessor("when", {
    header: "When (IST)",
    cell: (c) => <span className={styles.nowrap}>{c.getValue()}</span>,
  }),
  column.accessor("who", { header: "Who" }),
  column.accessor("action", {
    header: "Action",
    cell: (c) => <Badge tone={ACTION_TONE[c.getValue()] ?? "neutral"}>{c.getValue()}</Badge>,
  }),
  column.accessor("recordName", {
    header: "Record",
    cell: (c) => (
      <>
        <div className={styles.record}>{c.getValue()}</div>
        <div className={styles.muted}>{c.row.original.entityType}</div>
      </>
    ),
  }),
  column.accessor("summary", {
    header: "Changes",
    cell: (c) => <span className={styles.summary}>{c.getValue()}</span>,
  }),
]);

/** The audit entries, newest first. Click a row's arrow to see every field's before and after. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  const table = useTable({
    features,
    columns,
    data: rows,
    getRowId: (r) => r.id,
    // Every entry has a details panel (its before/after table), not sub-rows.
    getRowCanExpand: () => true,
  });

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col">
                  <table.FlexRender header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr className={row.getIsExpanded() ? styles.openRow : undefined}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
              {row.getIsExpanded() && (
                <tr className={styles.detailRow}>
                  <td colSpan={columns.length}>
                    <ChangeDetails changes={row.original.changes} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
