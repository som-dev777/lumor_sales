"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { officeSchema, type OfficeData, type OfficeInput } from "@/lib/validation/leads";
import { removeOffice, saveOffice } from "@/server/actions/leads";
import { FormProblems } from "./FormProblems";
import styles from "./leads.module.scss";

const EMPTY_OFFICE: OfficeInput = {
  name: "",
  city: "",
  country: "",
  address: "",
  isMain: false,
  ownerId: "",
};

const LABELS = {
  name: "Office name",
  city: "City",
  country: "Country",
  address: "Address",
  ownerId: "Owner",
};

/** Add office, or Edit an office (F28): name, city, country, address, main office, owner. */
export function OfficeDialogButton({
  companyId,
  companyName,
  officeId,
  defaults,
  owners,
  canChooseOwner,
}: {
  companyId: string;
  companyName: string;
  officeId?: string;
  defaults?: OfficeInput;
  /** Active reps, for the Owner choice. */
  owners: { id: string; label: string }[];
  /** Admins (adding), or the office's owner and Admins (editing). */
  canChooseOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {officeId ? (
        <Button
          variant="ghost"
          onClick={() => setOpen(true)}
          aria-label={`Edit the office ${defaults?.name ?? ""}`}
        >
          <Pencil size={16} aria-hidden /> Edit
        </Button>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <MapPin size={16} aria-hidden /> Add office
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={officeId ? "Edit office" : `Add an office to ${companyName}`}
      >
        {open && (
          <OfficeForm
            companyId={companyId}
            officeId={officeId ?? null}
            defaults={defaults ?? EMPTY_OFFICE}
            owners={owners}
            canChooseOwner={canChooseOwner}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

function OfficeForm({
  companyId,
  officeId,
  defaults,
  owners,
  canChooseOwner,
  onDone,
}: {
  companyId: string;
  officeId: string | null;
  defaults: OfficeInput;
  owners: { id: string; label: string }[];
  canChooseOwner: boolean;
  onDone: () => void;
}) {
  const notify = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OfficeInput, unknown, OfficeData>({
    resolver: zodResolver(officeSchema),
    defaultValues: defaults,
  });
  const { formError, apply } = useServerResult(setError);
  const onSubmit = handleSubmit(async (values) => {
    const r = await saveOffice(companyId, officeId, values);
    apply(r);
    if (r.ok) {
      notify("success", r.message ?? "Saved.");
      onDone();
    }
  });
  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <TextField
        label="Office name"
        placeholder="e.g. Corporate office, or Bangalore office"
        autoFocus
        error={errors.name?.message}
        {...register("name")}
      />
      <div className={styles.row2}>
        <TextField label="City" error={errors.city?.message} {...register("city")} />
        <TextField label="Country" error={errors.country?.message} {...register("country")} />
      </div>
      <TextField
        label="Address (optional)"
        error={errors.address?.message}
        {...register("address")}
      />
      <label className={styles.checkRow}>
        <input type="checkbox" {...register("isMain")} /> Main (corporate) office
      </label>
      {canChooseOwner && (
        <SelectField
          label="Owner"
          options={[
            { value: "", label: officeId ? "Keep the current owner" : "Me" },
            ...owners.map((o) => ({ value: o.id, label: o.label })),
          ]}
          hint="The previous owner and the new owner both get a notification."
          {...register("ownerId")}
        />
      )}
      <FormProblems formError={formError} errors={errors} labels={LABELS} />
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {officeId ? "Save office" : "Add office"}
        </Button>
      </div>
    </form>
  );
}

/** Delete an office with no people (F28), after a confirmation. */
export function DeleteOfficeButton({ officeId, name }: { officeId: string; name: string }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={`Delete the office ${name}`}
      >
        <Trash2 size={16} aria-hidden /> Delete
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete the office ${name}?`}
        description="This can't be undone. Offices with people linked can't be deleted."
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
                const r = await removeOffice(officeId);
                notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Deleted.") : r.error);
                if (r.ok) setOpen(false);
              })
            }
          >
            Delete office
          </Button>
        </div>
      </Dialog>
    </>
  );
}
