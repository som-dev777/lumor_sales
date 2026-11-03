"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { duplicate, removePlan, type PlanResult } from "@/server/actions/plans";
import styles from "./plans.module.scss";

type Props = {
  planId: string;
  name: string;
  canEdit: boolean;
  /** People on it now. */
  enrolled: number;
};

/** The plan page's buttons (F17; D-045: Edit, Duplicate, Delete). The server checks each again. */
export function PlanActions({ planId, name, canEdit, enrolled }: Props) {
  const router = useRouter();
  const notify = useToast();
  const [busy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const act = (fn: () => Promise<PlanResult>) =>
    start(async () => {
      const r = await fn();
      notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
      if (r.ok && r.link) router.push(r.link);
    });

  return (
    <div className={styles.actions}>
      {canEdit && (
        <Link href={`/plans/${planId}/edit`} className={styles.linkButton}>
          <Pencil size={16} aria-hidden /> Edit
        </Link>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => act(() => duplicate(planId))}>
        <Copy size={16} aria-hidden /> Duplicate
      </Button>
      {canEdit && (
        <>
          <Button variant="danger" disabled={busy} onClick={() => setConfirming(true)}>
            <Trash2 size={16} aria-hidden /> Delete
          </Button>
          <Dialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`Delete "${name}"?`}
            description={
              enrolled > 0
                ? `${enrolled} ${enrolled === 1 ? "person is" : "people are"} on this plan. Their plan stops; what already happened stays on their timeline.`
                : "It's removed for good."
            }
          >
            <div className={styles.row}>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                Keep it
              </Button>
              <Button variant="danger" loading={busy} onClick={() => act(() => removePlan(planId))}>
                Delete plan
              </Button>
            </div>
          </Dialog>
        </>
      )}
    </div>
  );
}
