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
import { LEVELS, LOST_REASONS, SENIORITIES, STAGES } from "@/lib/db/enums";
import { personSchema, type PersonData, type PersonInput } from "@/lib/validation/leads";
import { fillPersonWithAi } from "@/server/actions/ai";
import { savePerson } from "@/server/actions/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import { FormProblems } from "./FormProblems";
import styles from "./leads.module.scss";
import { useAiFill } from "./useAiFill";

export const EMPTY_PERSON: PersonInput = {
  fullName: "",
  title: "",
  linkedinUrl: "",
  salesNavUrl: "",
  companyName: "",
  officeId: "",
  personaId: "",
  level: "",
  accountFilterId: "",
  market: "India",
  ownerId: "",
  stage: "Prospect",
  lostReason: "",
  openerTemplateId: "",
  nextAction: "",
  nextActionDate: "",
  notes: "",
  phone: "",
  email: "",
  seniority: "",
  doNotContact: false,
  dncReason: "",
};

const NEW_COMPANY = "__new__";

const PERSON_LABELS: Record<string, string> = {
  fullName: "Full name",
  title: "Title",
  linkedinUrl: "LinkedIn profile link",
  salesNavUrl: "Sales Navigator link",
  companyName: "Company",
  officeId: "Office",
  personaId: "Persona",
  level: "Level",
  accountFilterId: "Account filter",
  market: "Market / country",
  ownerId: "Owner",
  stage: "Stage",
  lostReason: "Lost reason",
  openerTemplateId: "Opener template",
  nextAction: "Next action",
  nextActionDate: "Next action date",
  notes: "Notes",
  phone: "Phone",
  email: "Email",
  seniority: "Seniority",
  dncReason: "Why not contact them",
};

const choices = (items: { id: string; label: string }[], none: string) => [
  { value: "", label: none },
  ...items.map((i) => ({ value: i.id, label: i.label })),
];
const plain = (values: readonly string[], none?: string) => [
  ...(none ? [{ value: "", label: none }] : []),
  ...values.map((v) => ({ value: v, label: v })),
];

type Props = {
  personId: string | null;
  defaultValues: PersonInput;
  options: LeadFormOptions;
  /** Admins can choose the owner; others own what they add. */
  canChooseOwner: boolean;
  onDone: () => void;
};

export function PersonForm({ personId, defaultValues, options, canChooseOwner, onDone }: Props) {
  const notify = useToast();
  const router = useRouter();
  const [duplicateLink, setDuplicateLink] = useState<string | null>(null);
  // The company is picked from the list; "Add a new company" shows a name box instead.
  const known = (name: string | null | undefined) =>
    Boolean(name) && options.companies.some((c) => c.toLowerCase() === name!.trim().toLowerCase());
  const [newCompany, setNewCompany] = useState(
    Boolean(defaultValues.companyName) && !known(defaultValues.companyName),
  );
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<PersonInput, unknown, PersonData>({
    resolver: zodResolver(personSchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);
  // Fill with AI (F24): only fields left empty come back.
  const ai = useAiFill(
    () => fillPersonWithAi(getValues()),
    (values) => {
      for (const [name, value] of Object.entries(values)) {
        setValue(name as keyof PersonInput, value, { shouldDirty: true });
      }
    },
  );
  const field = (name: keyof PersonInput) => ({
    ...register(name, { onChange: () => ai.edited(name) }),
    hint: ai.hint(name),
  });
  const stage = useWatch({ control, name: "stage" });
  const companyName = useWatch({ control, name: "companyName" });
  const companyOffices = options.offices.filter(
    (o) => o.companyName.toLowerCase() === (companyName ?? "").trim().toLowerCase(),
  );
  const dnc = useWatch({ control, name: "doNotContact" });

  const onSubmit = handleSubmit(async (values) => {
    setDuplicateLink(null);
    const result = await savePerson(personId, values);
    apply(result);
    if (!result.ok && result.link) setDuplicateLink(result.link);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
      if (!personId && result.link) router.push(result.link);
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <div className={styles.row2}>
        <TextField
          label="Full name"
          autoFocus
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <TextField label="Title" error={errors.title?.message} {...field("title")} />
      </div>
      <TextField
        label="LinkedIn profile link"
        placeholder="https://www.linkedin.com/in/…"
        hint="The public profile link (linkedin.com/in/…), used to stop duplicates. If you don't have it, add their email below instead."
        error={errors.linkedinUrl?.message}
        {...register("linkedinUrl")}
      />
      <TextField
        label="Sales Navigator link (optional)"
        placeholder="https://www.linkedin.com/sales/lead/…"
        error={errors.salesNavUrl?.message}
        {...register("salesNavUrl")}
      />
      <div className={styles.row2}>
        <SelectField
          label="Company"
          value={
            newCompany
              ? NEW_COMPANY
              : (options.companies.find(
                  (c) => c.toLowerCase() === (companyName ?? "").trim().toLowerCase(),
                ) ?? "")
          }
          error={newCompany ? undefined : errors.companyName?.message}
          onChange={(e) => {
            const v = e.target.value;
            setNewCompany(v === NEW_COMPANY);
            setValue("companyName", v === NEW_COMPANY ? "" : v, {
              shouldValidate: v !== NEW_COMPANY,
            });
            // A different company has different offices (F28).
            setValue("officeId", "");
          }}
          options={[
            { value: "", label: "Choose a company…" },
            ...options.companies.map((c) => ({ value: c, label: c })),
            { value: NEW_COMPANY, label: "+ Add a new company" },
          ]}
        />
        {newCompany ? (
          <TextField
            label="New company name"
            autoFocus
            error={errors.companyName?.message}
            {...register("companyName")}
          />
        ) : (
          // F28: one of the chosen company's offices (optional).
          <SelectField
            label="Office (optional)"
            hint={
              companyName && companyOffices.length === 0
                ? "No offices yet: add them on the company's page."
                : undefined
            }
            error={errors.officeId?.message}
            options={[
              { value: "", label: companyOffices.length ? "Not set" : "No offices" },
              ...companyOffices.map((o) => ({ value: o.id, label: o.label })),
            ]}
            {...register("officeId")}
          />
        )}
      </div>
      <div className={styles.row2}>
        <SelectField
          label="Persona"
          options={choices(options.personas, "No persona")}
          {...field("personaId")}
        />
        <SelectField label="Level" options={plain(LEVELS, "Not set")} {...field("level")} />
      </div>
      <div className={styles.row2}>
        <TextField
          label="Phone (optional)"
          type="tel"
          error={errors.phone?.message}
          {...register("phone")}
        />
        <TextField
          label="Email (optional)"
          type="email"
          error={errors.email?.message}
          {...register("email")}
        />
      </div>
      <SelectField
        label="Seniority (optional)"
        options={plain(SENIORITIES, "Not set")}
        {...field("seniority")}
      />
      <div className={styles.row2}>
        <SelectField
          label="Account filter"
          options={choices(options.accountFilters, "No account filter")}
          {...field("accountFilterId")}
        />
        <TextField label="Market / country" error={errors.market?.message} {...field("market")} />
      </div>
      <SelectField
        label="Opener template"
        options={choices(options.templates, "None yet")}
        {...register("openerTemplateId")}
      />
      {canChooseOwner && (
        <SelectField
          label="Owner"
          options={choices(options.owners, "Me")}
          {...register("ownerId")}
        />
      )}
      <div className={styles.row2}>
        <SelectField
          label="Stage"
          options={plain(STAGES)}
          error={errors.stage?.message}
          {...register("stage")}
        />
        {stage === "Lost" && (
          <SelectField
            label="Lost reason"
            options={plain(LOST_REASONS, "Choose a reason")}
            error={errors.lostReason?.message}
            {...register("lostReason")}
          />
        )}
      </div>
      <div className={styles.row2}>
        <TextField
          label="Next action"
          placeholder="e.g. Send Message 1"
          error={errors.nextAction?.message}
          {...register("nextAction")}
        />
        <TextField
          label="Next action date"
          type="date"
          error={errors.nextActionDate?.message}
          {...register("nextActionDate")}
        />
      </div>
      <TextArea label="Notes" rows={3} error={errors.notes?.message} {...field("notes")} />
      <label className={styles.checkRow}>
        <input type="checkbox" {...register("doNotContact")} />
        Do not contact (stops their plan and blocks outreach)
      </label>
      {dnc && (
        <TextField
          label="Why not contact them?"
          error={errors.dncReason?.message}
          {...register("dncReason")}
        />
      )}
      {ai.panel}
      <FormProblems
        formError={formError}
        errors={errors}
        labels={PERSON_LABELS}
        link={duplicateLink ? { href: duplicateLink, label: "Open the existing person" } : null}
      />
      <div className={styles.formActions}>
        {ai.button}
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {personId ? "Save changes" : "Add person"}
        </Button>
      </div>
    </form>
  );
}
