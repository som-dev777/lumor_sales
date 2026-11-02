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
  /** "Add person" from a company page: the company is filled in. */
  companyName?: string;
  /** The button's words, e.g. "Add as person" on a booking (F22). */
  label?: string;
  /** Read by screen readers instead of the label, when several buttons share it. */
  ariaLabel?: string;
};

/** "Add person" (no personId) or "Edit" (with personId). */
export function PersonDialogButton({
  personId,
  defaults,
  options,
  canChooseOwner,
  companyName,
  label = "Add person",
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {personId ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil size={16} aria-hidden />
          Edit
        </Button>
      ) : (
        <Button
          variant={label === "Add person" ? "primary" : "secondary"}
          onClick={() => setOpen(true)}
          aria-label={ariaLabel}
        >
          <UserPlus size={16} aria-hidden />
          {label}
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
            defaultValues={defaults ?? { ...EMPTY_PERSON, companyName: companyName ?? "" }}
            options={options}
            canChooseOwner={canChooseOwner}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
