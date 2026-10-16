"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ActionResult } from "@/lib/action-result";
import { cancelInvite } from "@/server/actions/users";
import styles from "./users.module.scss";

export type InviteRow = { id: string; email: string; role: "Admin" | "User"; expires: string };

export function PendingInvites({ invites }: { invites: InviteRow[] }) {
  const [target, setTarget] = useState<InviteRow | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  function confirm() {
    if (!target) return;
    startTransition(async () => {
      setResult(await cancelInvite(target.id));
      setTarget(null);
    });
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Pending invites</h2>
      {result && (
        <div className={styles.result}>
          <Alert tone={result.ok ? "success" : "error"}>
            {result.ok ? result.message : result.error}
          </Alert>
        </div>
      )}
      {invites.length === 0 ? (
        <p className={styles.empty}>No pending invites.</p>
      ) : (
        <ul className={styles.inviteList}>
          {invites.map((inv) => (
            <li key={inv.id} className={styles.inviteItem}>
              <div>
                <div className={styles.name}>
                  {inv.email}{" "}
                  <Badge tone={inv.role === "Admin" ? "primary" : "neutral"}>{inv.role}</Badge>
                </div>
                <div className={styles.email}>Expires {inv.expires}</div>
              </div>
              <Button variant="secondary" onClick={() => setTarget(inv)}>
                Cancel invite
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && !busy && setTarget(null)}
        title={`Cancel the invite for ${target?.email}?`}
        description="The link will stop working. You can send a new invite later."
        confirmLabel="Cancel invite"
        tone="danger"
        busy={busy}
        onConfirm={confirm}
      />
    </section>
  );
}
