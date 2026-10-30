"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { removePerson } from "@/server/actions/leads";

/** Admins: delete a person with their conversation and plan history. */
export function DeletePersonButton({ personId, name }: { personId: string; name: string }) {
  const notify = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 size={16} aria-hidden /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="Their conversation and plan history are deleted too. This can't be undone; the Audit Log keeps a copy of their details."
        confirmLabel="Delete person"
        tone="danger"
        busy={busy}
        onConfirm={() =>
          start(async () => {
            const r = await removePerson(personId);
            notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Deleted.") : r.error);
            if (r.ok) {
              setOpen(false);
              router.push(r.link ?? "/people");
            }
          })
        }
      />
    </>
  );
}
