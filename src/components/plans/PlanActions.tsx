"use client";

import { Archive, Copy, Pencil, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { archive, decide, duplicate, propose, type PlanResult } from "@/server/actions/plans";
import styles from "./plans.module.scss";

type Props = {
  planId: string;
  canEdit: boolean;
  canPropose: boolean;
  canDecide: boolean;
  archived: boolean;
};

/** The plan page's buttons (F17). The server checks every one again. */
export function PlanActions({ planId, canEdit, canPropose, canDecide, archived }: Props) {
  const router = useRouter();
  const notify = useToast();
  const [busy, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");

  const act = (fn: () => Promise<PlanResult>) =>
    start(async () => {
      const r = await fn();
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
      if (r.ok && r.link) router.push(r.link);
      if (r.ok) setRejecting(false);
    });

  return (
    <div className={styles.actions}>
      {canEdit && !archived && (
        <Link href={`/plans/${planId}/edit`} className={styles.linkButton}>
          <Pencil size={16} aria-hidden /> Edit steps
        </Link>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => act(() => duplicate(planId))}>
        <Copy size={16} aria-hidden /> Duplicate
      </Button>
      {canPropose && (
        <Button variant="secondary" disabled={busy} onClick={() => act(() => propose(planId))}>
          <Send size={16} aria-hidden /> Propose as Official
        </Button>
      )}
      {canEdit && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => act(() => archive(planId, !archived))}
        >
          {archived ? <RotateCcw size={16} aria-hidden /> : <Archive size={16} aria-hidden />}
          {archived ? "Restore" : "Archive"}
        </Button>
      )}
      {canDecide && (
        <>
          <Button disabled={busy} onClick={() => act(() => decide(planId, "Approved", ""))}>
            Approve
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </Button>
          <Dialog open={rejecting} onOpenChange={setRejecting} title="Reject this plan">
            <div className={styles.form}>
              <TextArea
                label="Why? (the proposer sees this)"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className={styles.row}>
                <Button variant="secondary" onClick={() => setRejecting(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  loading={busy}
                  disabled={!note.trim()}
                  onClick={() => act(() => decide(planId, "Rejected", note))}
                >
                  Reject
                </Button>
              </div>
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}
