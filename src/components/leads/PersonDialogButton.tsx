"use client";

import { Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { PersonInput } from "@/lib/validation/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import { EMPTY_PERSON, PersonForm } from "./PersonForm";

type Props = {
  personId?: string;
  defaults?: PersonInput;
  options: LeadFormOptions;
  canChooseOwner: boolean;
};

/** "Add person" (no personId) or "Edit" (with personId). */
export function PersonDialogButton({ personId, defaults, options, canChooseOwner }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {personId ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil size={16} aria-hidden />
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <UserPlus size={16} aria-hidden />
          Add person
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={personId ? "Edit person" : "Add a person"}
        description={
          personId
            ? undefined
            : "Paste their public LinkedIn link. The same person can't be added twice."
        }
      >
        {open && (
          <PersonForm
            personId={personId ?? null}
            defaultValues={defaults ?? EMPTY_PERSON}
            options={options}
            canChooseOwner={canChooseOwner}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
