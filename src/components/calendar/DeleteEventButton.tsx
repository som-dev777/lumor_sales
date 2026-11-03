"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { deleteMeetingTypeAction } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

/** Delete an event for good, after a confirmation (D-048). */
export function DeleteEventButton({
  id,
  name,
  upcoming,
}: {
  id: string;
  name: string;
  /** Upcoming meetings booked from it (they stay on the calendar). */
  upcoming: number;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} aria-label={`Delete ${name}`}>
        <Trash2 size={16} aria-hidden /> Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${name}"?`}
        description={`This can't be undone. Its booking link stops working straight away.${
          upcoming > 0
            ? ` The ${upcoming} upcoming meeting${upcoming === 1 ? "" : "s"} booked from it stay on your calendar.`
            : ""
        }`}
      >
        <div className={styles.formActions}>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
            Keep it
          </Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={() =>
              start(async () => {
                const r = await deleteMeetingTypeAction(id);
                notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Deleted.") : r.error);
                if (r.ok) setOpen(false);
              })
            }
          >
            Delete event
          </Button>
        </div>
      </Dialog>
    </>
  );
}
