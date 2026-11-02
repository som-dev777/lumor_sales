"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { disconnectGoogleAction } from "@/server/actions/calendar";

/** Disconnect Google Calendar (F26), after a confirmation. */
export function GoogleDisconnect() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Disconnect Google Calendar?"
        description="New bookings won't get Google Meet links or avoid your Google busy times. Meetings already in Google stay there."
        confirmLabel="Disconnect"
        tone="danger"
        busy={busy}
        onConfirm={() =>
          start(async () => {
            const r = await disconnectGoogleAction();
            notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
            setOpen(false);
          })
        }
      />
    </>
  );
}
