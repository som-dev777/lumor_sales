"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { cancelBookingAction } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

/** The rep cancels a booking; the reason goes in the cancellation email (F22). */
export function CancelBookingButton({ id, who }: { id: string; who: string }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Cancel booking with ${who}`}
      >
        Cancel
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel booking"
        description={`${who} gets an email that it's cancelled, with the reason if you give one.`}
      >
        <div className={styles.stack}>
          <TextArea
            label="Reason (optional)"
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                start(async () => {
                  const r = await cancelBookingAction(id, reason);
                  notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Cancelled.") : r.error);
                  if (r.ok) setOpen(false);
                })
              }
            >
              Cancel booking
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
