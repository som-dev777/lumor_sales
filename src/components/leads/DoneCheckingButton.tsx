"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { doneChecking } from "@/server/actions/leads";

/** Clears the "check details" flag a booking left on a new person (D-043). */
export function DoneCheckingButton({ personId }: { personId: string }) {
  const notify = useToast();
  const [busy, start] = useTransition();
  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={() =>
        start(async () => {
          const r = await doneChecking(personId);
          notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
        })
      }
    >
      Done checking
    </Button>
  );
}
