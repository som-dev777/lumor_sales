"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { approve, reject } from "@/server/actions/approvals";
import styles from "./approvals.module.scss";

/** Approve (with a confirmation) or Reject (with an optional note) one proposal. */
export function ProposalActions({
  proposalId,
  itemName,
}: {
  proposalId: string;
  itemName: string;
}) {
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, startTransition] = useTransition();

  function done(result: Awaited<ReturnType<typeof approve>>) {
    notify(result.ok ? "success" : "error", result.ok ? (result.message ?? "Done.") : result.error);
    if (result.ok) {
      setConfirming(false);
      setRejecting(false);
    }
  }

  return (
    <div className={styles.actions}>
      <Button variant="secondary" onClick={() => setRejecting(true)}>
        Reject
      </Button>
      <Button onClick={() => setConfirming(true)}>Approve</Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !busy && setConfirming(o)}
        title={`Approve "${itemName}"?`}
        description="It becomes Official, owned by you, and locked for Users. The person who proposed it is kept on record."
        confirmLabel="Approve"
        busy={busy}
        onConfirm={() => startTransition(async () => done(await approve(proposalId)))}
      />

      <Dialog
        open={rejecting}
        onOpenChange={(o) => !busy && setRejecting(o)}
        title={`Reject "${itemName}"?`}
        description="It stays Personal. The person who proposed it sees your note and can change it and propose again."
      >
        <div className={styles.rejectForm}>
          <TextArea
            label="Note for the proposer (optional)"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint={`${500 - note.length} characters left`}
          />
          <div className={styles.dialogActions}>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => startTransition(async () => done(await reject(proposalId, note)))}
            >
              Reject
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
