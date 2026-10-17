"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CheckboxGroup } from "@/components/ui/CheckboxGroup";
import { SelectField } from "@/components/ui/SelectField";
import { TagInput } from "@/components/ui/TagInput";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { PERSONA_FUNCTIONS, SENIORITIES } from "@/lib/db/enums";
import { personaSchema, type PersonaData, type PersonaInput } from "@/lib/validation/library";
import { createLibraryItem, updateLibraryItem } from "@/server/actions/library";
import styles from "./library.module.scss";

const TIER_OPTIONS = [
  { value: "1", label: "Tier 1 (highest priority)" },
  { value: "2", label: "Tier 2" },
  { value: "3", label: "Tier 3" },
] as const;

export const EMPTY_PERSONA: PersonaInput = {
  name: "",
  tier: 2,
  functions: [],
  seniority: [],
  jobTitles: [],
  geography: ["India"],
  whoItCovers: "",
  toolsUsedToday: "",
  leadWithAngle: "",
  notes: "",
};

type Props = {
  /** Editing an existing persona (its id), or creating a new one of this type. */
  target: { mode: "edit"; id: string } | { mode: "create"; type: "Official" | "Personal" };
  defaultValues: PersonaInput;
  onDone: () => void;
};

export function PersonaForm({ target, defaultValues, onDone }: Props) {
  const notify = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PersonaInput, unknown, PersonaData>({
    resolver: zodResolver(personaSchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const result =
      target.mode === "edit"
        ? await updateLibraryItem("persona", target.id, values)
        : await createLibraryItem("persona", target.type, values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className={styles.row}>
        <TextField label="Name" autoFocus error={errors.name?.message} {...register("name")} />
        <SelectField
          label="Tier"
          options={TIER_OPTIONS}
          error={errors.tier?.message}
          {...register("tier")}
        />
      </div>
      <Controller
        control={control}
        name="functions"
        render={({ field, fieldState }) => (
          <CheckboxGroup
            label="Function"
            options={PERSONA_FUNCTIONS}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="seniority"
        render={({ field, fieldState }) => (
          <CheckboxGroup
            label="Seniority"
            options={SENIORITIES}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="jobTitles"
        render={({ field, fieldState }) => (
          <TagInput
            label="Job titles"
            placeholder="e.g. Head of Research, then Enter"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="geography"
        render={({ field, fieldState }) => (
          <TagInput
            label="Geography"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <TextArea
        label="Who it covers"
        error={errors.whoItCovers?.message}
        {...register("whoItCovers")}
      />
      <TextArea
        label="Tools used today"
        rows={2}
        error={errors.toolsUsedToday?.message}
        {...register("toolsUsedToday")}
      />
      <TextArea
        label="Lead-with angle"
        error={errors.leadWithAngle?.message}
        {...register("leadWithAngle")}
      />
      <TextArea label="Notes" rows={2} error={errors.notes?.message} {...register("notes")} />
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {target.mode === "edit" ? "Save changes" : "Create persona"}
        </Button>
      </div>
    </form>
  );
}
