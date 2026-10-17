"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { KIND_NOUN, type LibraryKind } from "@/server/library/kinds";
import { LibraryForm } from "./LibraryForm";

/** "Add persona" (or filter/template). Creates an Official item on the Official tab (Admins). */
export function AddItemButton({
  kind,
  type,
}: {
  kind: LibraryKind;
  type: "Official" | "Personal";
}) {
  const [open, setOpen] = useState(false);
  const noun = KIND_NOUN[kind];
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden />
        Add {noun}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={`New ${type === "Official" ? "Official" : "Personal"} ${noun}`}
        description={
          type === "Official"
            ? "Official items are the team's playbook. Only Admins can change them."
            : "Personal items are yours to try out. You can propose a good one as Official."
        }
      >
        {open && (
          <LibraryForm
            kind={kind}
            target={{ mode: "create", type }}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
