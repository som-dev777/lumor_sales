"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  playbookSettingsSchema,
  type PlaybookSettingsData,
  type PlaybookSettingsInput,
} from "@/lib/validation/settings";
import { updatePlaybookSettings } from "@/server/actions/settings";
import { PLAYBOOK_LABELS } from "./fields";
import styles from "./settings.module.scss";

type Values = Record<keyof typeof PLAYBOOK_LABELS, number>;

/** Admin only: edit Playbook Settings in a dialog (F13). The server checks the role again. */
export function PlaybookButton({ defaults }: { defaults: Values }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={16} aria-hidden />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Edit Playbook Settings">
        {open && <PlaybookForm defaults={defaults} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function PlaybookForm({ defaults, onDone }: { defaults: Values; onDone: () => void }) {
  const notify = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlaybookSettingsInput, unknown, PlaybookSettingsData>({
    resolver: zodResolver(playbookSettingsSchema),
    defaultValues: defaults,
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const result = await updatePlaybookSettings(values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      {(Object.keys(PLAYBOOK_LABELS) as (keyof Values)[]).map((k, i) => (
        <TextField
          key={k}
          label={`${PLAYBOOK_LABELS[k].label} (${PLAYBOOK_LABELS[k].unit})`}
          hint={PLAYBOOK_LABELS[k].hint}
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus={i === 0}
          error={errors[k]?.message}
          {...register(k)}
        />
      ))}
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
