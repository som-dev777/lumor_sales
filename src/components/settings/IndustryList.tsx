"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { removeIndustry, saveIndustry } from "@/server/actions/industries";
import styles from "./industries.module.scss";

type Row = { id: string; name: string; companies: number; accountFilters: number };

/** Add (everyone), rename and delete (Admins) industries. The server checks the role again. */
export function IndustryList({ rows, canManage }: { rows: Row[]; canManage: boolean }) {
  const notify = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveIndustry(null, name);
      if (!r.ok) return setError(r.error);
      notify("success", r.message ?? "Added.");
      setError(null);
      setName("");
    });
  };

  return (
    <div className={styles.stack}>
      <form className={styles.addRow} onSubmit={add} aria-label="Add an industry">
        <TextField
          label="New industry"
          value={name}
          maxLength={100}
          error={error ?? undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" loading={busy} disabled={!name.trim()}>
          <Plus size={16} aria-hidden /> Add
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className={styles.muted}>No industries yet.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((r) => (
            <IndustryRow key={`${r.id}-${r.name}`} row={r} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IndustryRow({ row, canManage }: { row: Row; canManage: boolean }) {
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const used = [
    row.companies ? `${row.companies} ${row.companies === 1 ? "company" : "companies"}` : null,
    row.accountFilters
      ? `${row.accountFilters} account ${row.accountFilters === 1 ? "filter" : "filters"}`
      : null,
  ].filter(Boolean);

  return (
    <li className={styles.item} aria-label={row.name}>
      {editing ? (
        <form
          className={styles.addRow}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveIndustry(row.id, name);
              if (!r.ok) return setError(r.error);
              notify("success", r.message ?? "Saved.");
              setEditing(false);
            });
          }}
        >
          <TextField
            label={`Rename ${row.name}`}
            value={name}
            maxLength={100}
            autoFocus
            error={error ?? undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" loading={busy}>
            Save
          </Button>
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <div>
            <strong>{row.name}</strong>
            <span className={styles.muted}>
              {" "}
              · {used.length ? `used by ${used.join(" and ")}` : "not used yet"}
            </span>
          </div>
          {canManage && (
            <div className={styles.actions}>
              <Button
                variant="ghost"
                onClick={() => setEditing(true)}
                aria-label={`Edit ${row.name}`}
              >
                <Pencil size={16} aria-hidden /> Edit
              </Button>
              <Button
                variant="ghost"
                onClick={() => setDeleting(true)}
                aria-label={`Delete ${row.name}`}
              >
                <Trash2 size={16} aria-hidden /> Delete
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${row.name}?`}
        description={
          used.length
            ? `It's cleared from ${used.join(" and ")}. This can't be undone.`
            : "This can't be undone."
        }
        confirmLabel="Delete industry"
        tone="danger"
        busy={busy}
        onConfirm={() =>
          start(async () => {
            const r = await removeIndustry(row.id);
            notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Deleted.") : r.error);
            if (r.ok) setDeleting(false);
          })
        }
      />
      {error && !editing && <Alert tone="error">{error}</Alert>}
    </li>
  );
}
