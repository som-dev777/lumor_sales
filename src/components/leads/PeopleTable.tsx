"use client";

import {
  createColumnHelper,
  rowSelectionFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { Stage } from "@/lib/db/enums";
import { reassign } from "@/server/actions/leads";
import { enrol } from "@/server/actions/plans";
import { StageBadge } from "./StageBadge";
import styles from "./leads.module.scss";

export type PersonRow = {
  id: string;
  fullName: string;
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  personaName: string | null;
  stage: Stage;
  nextAction: string | null;
  nextActionLabel: string | null;
  overdue: boolean;
  ownerName: string | null;
};

const features = tableFeatures({ rowSelectionFeature });
const column = createColumnHelper<typeof features, PersonRow>();

type Props = {
  rows: PersonRow[];
  /** Admins can reassign selected rows' owner. */
  canReassign: boolean;
  owners: { id: string; label: string }[];
  /** Plans the viewer can enrol people in (F17); anyone can select rows to enrol. */
  plans: { id: string; label: string }[];
};

export function PeopleTable({ rows, canReassign, owners, plans }: Props) {
  const notify = useToast();
  const [newOwner, setNewOwner] = useState("");
  const [planId, setPlanId] = useState("");
  const [busy, startTransition] = useTransition();

  const columns = column.columns([
    ...(canReassign || plans.length > 0
      ? [
          column.display({
            id: "select",
            header: ({ table }) => (
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
              />
            ),
            cell: ({ row }) => (
              <input
                type="checkbox"
                aria-label={`Select ${row.original.fullName}`}
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
              />
            ),
          }),
        ]
      : []),
    column.accessor("fullName", {
      header: "Name",
      cell: (c) => (
        <>
          <Link href={`/people/${c.row.original.id}`} className={styles.name}>
            {c.getValue()}
          </Link>
          {c.row.original.title && <div className={styles.muted}>{c.row.original.title}</div>}
        </>
      ),
    }),
    column.accessor("companyName", {
      header: "Company",
      cell: (c) =>
        c.row.original.companyId ? (
          <Link href={`/companies/${c.row.original.companyId}`}>{c.getValue()}</Link>
        ) : (
          "—"
        ),
    }),
    column.accessor("personaName", { header: "Persona", cell: (c) => c.getValue() ?? "—" }),
    column.accessor("stage", { header: "Stage", cell: (c) => <StageBadge stage={c.getValue()} /> }),
    column.accessor("nextAction", {
      header: "Next action",
      cell: (c) => (
        <>
          <div>{c.getValue() ?? "—"}</div>
          {c.row.original.nextActionLabel && (
            <div className={c.row.original.overdue ? styles.overdue : styles.muted}>
              {c.row.original.overdue ? "Overdue · " : ""}
              {c.row.original.nextActionLabel}
            </div>
          )}
        </>
      ),
    }),
    column.accessor("ownerName", { header: "Owner", cell: (c) => c.getValue() ?? "—" }),
  ]);

  const table = useTable({ features, columns, data: rows, getRowId: (r) => r.id });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original.id);

  function doReassign() {
    startTransition(async () => {
      const result = await reassign(selected, newOwner);
      notify(
        result.ok ? "success" : "error",
        result.ok ? (result.message ?? "Done.") : result.error,
      );
      if (result.ok) table.resetRowSelection();
    });
  }

  function doEnrol() {
    startTransition(async () => {
      const result = await enrol(selected, planId);
      notify(
        result.ok ? "success" : "error",
        result.ok ? (result.message ?? "Done.") : result.error,
      );
      if (result.ok) table.resetRowSelection();
    });
  }

  return (
    <>
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
              <tr key={row.id} className={row.getIsSelected() ? styles.selected : undefined}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected.length > 0 && (
        <div className={styles.bulkBar} role="region" aria-label="Selected leads">
          <strong>{selected.length} selected</strong>
          {plans.length > 0 && (
            <>
              <label className={styles.srOnly} htmlFor="enrol-plan">
                Plan
              </label>
              <select
                id="enrol-plan"
                className={styles.control}
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
              >
                <option value="">Choose a plan…</option>
                {plans.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button disabled={!planId} loading={busy} onClick={doEnrol}>
                Enrol in plan
              </Button>
            </>
          )}
          {canReassign && (
            <>
              <label className={styles.srOnly} htmlFor="new-owner">
                New owner
              </label>
              <select
                id="new-owner"
                className={styles.control}
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
              >
                <option value="">Choose new owner…</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Button disabled={!newOwner} loading={busy} onClick={doReassign}>
                Reassign owner
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => table.resetRowSelection()}>
            Clear
          </Button>
        </div>
      )}
    </>
  );
}
