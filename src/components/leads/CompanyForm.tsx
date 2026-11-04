"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { COMPANY_STATUSES } from "@/lib/db/enums";
import { companySchema, type CompanyData, type CompanyInput } from "@/lib/validation/leads";
import { fillCompanyWithAi } from "@/server/actions/ai";
import { saveCompany } from "@/server/actions/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import { CompanyAiChat } from "./CompanyAiChat";
import { FormProblems } from "./FormProblems";
import styles from "./leads.module.scss";
import { useAiFill } from "./useAiFill";

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

const NEW_INDUSTRY = "__new__";

const COMPANY_LABELS: Record<string, string> = {
  name: "Company name",
  website: "Website",
  linkedinUrl: "LinkedIn page",
  industry: "Industry",
  headcountBand: "Headcount band",
  city: "City",
  country: "Country",
  accountFilterId: "Account filter",
  ownerId: "Owner",
  status: "Status",
  notes: "Notes",
};

export function CompanyForm({ companyId, defaultValues, options, canChooseOwner, onDone }: Props) {
  const notify = useToast();
  const router = useRouter();
  const [existingLink, setExistingLink] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CompanyInput, unknown, CompanyData>({
    resolver: zodResolver(companySchema),
    defaultValues,
  });
  const industry = useWatch({ control, name: "industry" }) ?? "";
  // Picked from the Industries list; "Add a new industry" shows a name box (added on save).
  const listed = (name: string) =>
    options.industries.find((i) => i.toLowerCase() === name.trim().toLowerCase());
  const [newIndustry, setNewIndustry] = useState(
    Boolean(defaultValues.industry) && !listed(defaultValues.industry ?? ""),
  );
  const { formError, apply } = useServerResult(setError);
  // Fill with AI (F24): only empty fields come back; a listed industry is picked in the list.
  const ai = useAiFill(
    () => fillCompanyWithAi(getValues()),
    (values) => {
      for (const [field, value] of Object.entries(values)) {
        if (field === "industry") {
          const known = listed(value);
          setNewIndustry(!known);
          setValue("industry", known ?? value, { shouldDirty: true });
        } else {
          setValue(field as keyof CompanyInput, value, { shouldDirty: true });
        }
      }
    },
  );
  const field = (name: keyof CompanyInput) => ({
    ...register(name, { onChange: () => ai.edited(name) }),
    hint: ai.hint(name),
  });

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
          {...field("website")}
        />
        <TextField
          label="LinkedIn page"
          placeholder="https://www.linkedin.com/company/…"
          error={errors.linkedinUrl?.message}
          {...field("linkedinUrl")}
        />
      </div>
      <div className={styles.row2}>
        <div className={styles.stackTight}>
          <SelectField
            label="Industry"
            value={newIndustry ? NEW_INDUSTRY : (listed(industry) ?? "")}
            hint={newIndustry ? undefined : ai.hint("industry")}
            onChange={(e) => {
              const v = e.target.value;
              ai.edited("industry");
              setNewIndustry(v === NEW_INDUSTRY);
              setValue("industry", v === NEW_INDUSTRY ? "" : v);
            }}
            options={[
              { value: "", label: "Not set" },
              ...options.industries.map((i) => ({ value: i, label: i })),
              { value: NEW_INDUSTRY, label: "+ Add a new industry" },
            ]}
          />
          {newIndustry && (
            <TextField
              label="New industry"
              autoFocus
              error={errors.industry?.message}
              {...field("industry")}
            />
          )}
        </div>
        <TextField
          label="Headcount band"
          placeholder="e.g. 51–200"
          error={errors.headcountBand?.message}
          {...field("headcountBand")}
        />
      </div>
      <div className={styles.row2}>
        <TextField label="City" error={errors.city?.message} {...field("city")} />
        <TextField label="Country" error={errors.country?.message} {...field("country")} />
      </div>
      <div className={styles.row2}>
        <SelectField
          label="Account filter"
          options={choices(options.accountFilters, "No account filter")}
          {...field("accountFilterId")}
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
      <TextArea label="Notes" rows={3} error={errors.notes?.message} {...field("notes")} />
      {ai.panel}
      <CompanyAiChat
        getCompany={getValues}
        startOpen={ai.done}
        onAddToNotes={(answer) => {
          const notes = (getValues("notes") ?? "").trim();
          setValue("notes", notes ? `${notes}\n\n${answer}` : answer, { shouldDirty: true });
        }}
      />
      <FormProblems
        formError={formError}
        errors={errors}
        labels={COMPANY_LABELS}
        link={existingLink ? { href: existingLink, label: "Open it" } : null}
      />
      <div className={styles.formActions}>
        {ai.button}
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
