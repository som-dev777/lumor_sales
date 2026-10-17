"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TagInput } from "@/components/ui/TagInput";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import {
  accountFilterSchema,
  type AccountFilterData,
  type AccountFilterInput,
} from "@/lib/validation/library";
import { createLibraryItem, updateLibraryItem } from "@/server/actions/library";
import type { FormTarget } from "./LibraryForm";
import styles from "./library.module.scss";

export const EMPTY_ACCOUNT_FILTER: AccountFilterInput = {
  code: "",
  name: "",
  industries: [],
  companyHeadcount: "",
  hqLocations: ["India"],
  keyFilters: "",
  exclusions: "",
  keywords: "",
  whyItMatters: "",
};

type Props = { target: FormTarget; defaultValues: AccountFilterInput; onDone: () => void };

export function AccountFilterForm({ target, defaultValues, onDone }: Props) {
  const notify = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AccountFilterInput, unknown, AccountFilterData>({
    resolver: zodResolver(accountFilterSchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const result =
      target.mode === "edit"
        ? await updateLibraryItem("accountFilter", target.id, values)
        : await createLibraryItem("accountFilter", target.type, values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className={styles.rowCode}>
        <TextField
          label="Code"
          placeholder="A7"
          autoFocus
          hint="Short, e.g. A7. Unique among Official filters."
          error={errors.code?.message}
          {...register("code")}
        />
        <TextField label="Name" error={errors.name?.message} {...register("name")} />
      </div>
      <Controller
        control={control}
        name="industries"
        render={({ field, fieldState }) => (
          <TagInput
            label="Industries"
            placeholder="e.g. Market Research, then Enter (leave empty for any)"
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <div className={styles.row}>
        <Controller
          control={control}
          name="hqLocations"
          render={({ field, fieldState }) => (
            <TagInput
              label="HQ location"
              value={field.value}
              onChange={field.onChange}
              error={fieldState.error?.message}
            />
          )}
        />
        <TextField
          label="Company headcount"
          placeholder="e.g. 11–500"
          error={errors.companyHeadcount?.message}
          {...register("companyHeadcount")}
        />
      </div>
      <TextArea
        label="Key filters"
        rows={2}
        hint="Sales Navigator filters, e.g. Research dept 5+"
        error={errors.keyFilters?.message}
        {...register("keyFilters")}
      />
      <TextArea
        label="Keywords"
        rows={2}
        error={errors.keywords?.message}
        {...register("keywords")}
      />
      <TextArea
        label="Exclusions"
        rows={2}
        error={errors.exclusions?.message}
        {...register("exclusions")}
      />
      <TextArea
        label="Why it matters"
        error={errors.whyItMatters?.message}
        {...register("whyItMatters")}
      />
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {target.mode === "edit" ? "Save changes" : "Create account filter"}
        </Button>
      </div>
    </form>
  );
}
