"use client";

import { Merge, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { useToast } from "@/components/ui/Toast";
import { mergeCompany, removeCompany } from "@/server/actions/leads";
import styles from "./leads.module.scss";

/** Admins: merge this company into another, or delete it (only when it has no people). */
export function CompanyAdminActions({
  companyId,
  companyName,
  peopleCount,
  others,
}: {
  companyId: string;
  companyName: string;
  peopleCount: number;
  others: { id: string; name: string }[];
}) {
  const notify = useToast();
  const router = useRouter();
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const finish = (r: Awaited<ReturnType<typeof removeCompany>>) => {
    if (!r.ok) return setError(r.error);
    notify("success", r.message ?? "Done.");
    setMerging(false);
    setDeleting(false);
    if (r.link) router.push(r.link);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setMerging(true)}>
        <Merge size={16} aria-hidden /> Merge
      </Button>
      <Button variant="danger" onClick={() => setDeleting(true)}>
        <Trash2 size={16} aria-hidden /> Delete
      </Button>
      <Dialog
        open={merging}
        onOpenChange={(o) => {
          setMerging(o);
          setError(null);
        }}
        title={`Merge ${companyName} into another company`}
        description="Use this for duplicates. Its people and their history move to the company you choose, empty details are filled in from it, its notes are kept, and then it's deleted."
      >
        <div className={styles.form}>
          {error && <Alert tone="error">{error}</Alert>}
          <SelectField
            label="Merge into"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            options={[
              { value: "", label: "Choose a company…" },
              ...others.map((o) => ({ value: o.id, label: o.name })),
            ]}
          />
          <div className={styles.formActions}>
            <Button
              loading={busy}
              disabled={!target}
              onClick={() => start(async () => finish(await mergeCompany(companyId, target)))}
            >
              Merge
            </Button>
            <Button variant="secondary" onClick={() => setMerging(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog
        open={deleting}
        onOpenChange={(o) => {
          setDeleting(o);
          setError(null);
        }}
        title={`Delete ${companyName}?`}
        description={
          error ??
          (peopleCount > 0
            ? `It still has ${peopleCount} ${peopleCount === 1 ? "person" : "people"}. Merge it into another company, or delete them first.`
            : "This can't be undone. The Audit Log keeps a copy of its details.")
        }
        confirmLabel="Delete company"
        tone="danger"
        busy={busy}
        onConfirm={() => start(async () => finish(await removeCompany(companyId)))}
      />
    </>
  );
}
