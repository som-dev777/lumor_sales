"use client";

import { Building2, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { CompanyInput } from "@/lib/validation/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import { CompanyForm, EMPTY_COMPANY } from "./CompanyForm";

type Props = {
  companyId?: string;
  defaults?: CompanyInput;
  options: LeadFormOptions;
  canChooseOwner: boolean;
};

export function CompanyDialogButton({ companyId, defaults, options, canChooseOwner }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {companyId ? (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <Pencil size={16} aria-hidden />
          Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Building2 size={16} aria-hidden />
          Add company
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={companyId ? "Edit company" : "Add a company"}
      >
        {open && (
          <CompanyForm
            companyId={companyId ?? null}
            defaultValues={defaults ?? EMPTY_COMPANY}
            options={options}
            canChooseOwner={canChooseOwner}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}
