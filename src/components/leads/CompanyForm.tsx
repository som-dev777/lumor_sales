"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { COMPANY_STATUSES } from "@/lib/db/enums";
import { companySchema, type CompanyData, type CompanyInput } from "@/lib/validation/leads";
import { saveCompany } from "@/server/actions/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import styles from "./leads.module.scss";

export const EMPTY_COMPANY: CompanyInput = {
  name: "",
  website: "",
  linkedinUrl: "",
  industry: "",
  headcountBand: "",
  city: "",
  country: "India",
  accountFilterId: "",
  ownerId: "",
  status: "Target",
  notes: "",
};

type Props = {
  companyId: string | null;
  defaultValues: CompanyInput;
  options: LeadFormOptions;
  canChooseOwner: boolean;
  onDone: () => void;
};

export function CompanyForm({ companyId, defaultValues, options, canChooseOwner, onDone }: Props) {
  const notify = useToast();
  const router = useRouter();
  const [existingLink, setExistingLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompanyInput, unknown, CompanyData>({
    resolver: zodResolver(companySchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    setExistingLink(null);
    const result = await saveCompany(companyId, values);
    apply(result);
    if (!result.ok && result.link) setExistingLink(result.link);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
      if (!companyId && result.link) router.push(result.link);
    }
  });

  const choices = (items: { id: string; label: string }[], none: string) => [
    { value: "", label: none },
    ...items.map((i) => ({ value: i.id, label: i.label })),
  ];

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && (
        <Alert tone="error">
          {formError} {existingLink && <Link href={existingLink}>Open it</Link>}
        </Alert>
      )}
      <TextField
        label="Company name"
        autoFocus
        error={errors.name?.message}
        {...register("name")}
      />
      <div className={styles.row2}>
        <TextField
          label="Website"
          placeholder="https://…"
          error={errors.website?.message}
          {...register("website")}
        />
        <TextField
          label="LinkedIn page"
          placeholder="https://www.linkedin.com/company/…"
          error={errors.linkedinUrl?.message}
          {...register("linkedinUrl")}
        />
      </div>
      <div className={styles.row2}>
        <TextField label="Industry" error={errors.industry?.message} {...register("industry")} />
        <TextField
          label="Headcount band"
          placeholder="e.g. 51–200"
          error={errors.headcountBand?.message}
          {...register("headcountBand")}
        />
      </div>
      <div className={styles.row2}>
        <TextField label="City" error={errors.city?.message} {...register("city")} />
        <TextField label="Country" error={errors.country?.message} {...register("country")} />
      </div>
      <div className={styles.row2}>
        <SelectField
          label="Account filter"
          options={choices(options.accountFilters, "No account filter")}
          {...register("accountFilterId")}
        />
        <SelectField
          label="Status"
          options={COMPANY_STATUSES.map((s) => ({ value: s, label: s }))}
          {...register("status")}
        />
      </div>
      {canChooseOwner && (
        <SelectField
          label="Owner"
          options={choices(options.owners, "Me")}
          {...register("ownerId")}
        />
      )}
      <TextArea label="Notes" rows={3} error={errors.notes?.message} {...register("notes")} />
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {companyId ? "Save changes" : "Add company"}
        </Button>
      </div>
    </form>
  );
}
