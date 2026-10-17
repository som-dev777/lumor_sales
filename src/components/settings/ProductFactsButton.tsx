"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  productFactsSchema,
  type ProductFactsData,
  type ProductFactsInput,
} from "@/lib/validation/settings";
import { updateProductFacts } from "@/server/actions/settings";
import { FACT_LABELS } from "./fields";
import styles from "./settings.module.scss";

const TEXT_FIELDS = [
  "whatLumorDoes",
  "liveFeatures",
  "featuresNotLive",
  "pricingGuidance",
  "positioningRules",
] as const;

/** Admin only: edit Product Facts in a dialog (F12). The server checks the role again. */
export function ProductFactsButton({ defaults }: { defaults: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Pencil size={16} aria-hidden />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title="Edit Product Facts">
        {open && <FactsForm defaults={defaults} onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}

function FactsForm({ defaults, onDone }: { defaults: Record<string, string>; onDone: () => void }) {
  const notify = useToast();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFactsInput, unknown, ProductFactsData>({
    resolver: zodResolver(productFactsSchema),
    defaultValues: defaults,
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const result = await updateProductFacts(values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      {TEXT_FIELDS.map((k, i) => (
        <TextArea
          key={k}
          label={FACT_LABELS[k].label}
          hint={FACT_LABELS[k].hint}
          rows={4}
          autoFocus={i === 0}
          maxLength={5000}
          error={errors[k]?.message}
          {...register(k)}
        />
      ))}
      <TextField
        label={FACT_LABELS.calendarLink.label}
        type="url"
        placeholder="https://"
        error={errors.calendarLink?.message}
        {...register("calendarLink")}
      />
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
