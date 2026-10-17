"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { LEVELS, LOST_REASONS, SENIORITIES, STAGES } from "@/lib/db/enums";
import { personSchema, type PersonData, type PersonInput } from "@/lib/validation/leads";
import { savePerson } from "@/server/actions/leads";
import type { LeadFormOptions } from "@/server/leads/options";
import fieldStyles from "@/components/ui/TextField.module.scss";
import styles from "./leads.module.scss";

export const EMPTY_PERSON: PersonInput = {
  fullName: "",
  title: "",
  linkedinUrl: "",
  salesNavUrl: "",
  companyName: "",
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
  const companiesId = useId();
  const [duplicateLink, setDuplicateLink] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PersonInput, unknown, PersonData>({
    resolver: zodResolver(personSchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);
  const stage = useWatch({ control, name: "stage" });
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
      {formError && (
        <Alert tone="error">
          {formError}
          {duplicateLink && (
            <>
              {" "}
              <Link href={duplicateLink}>Open the existing person</Link>
            </>
          )}
        </Alert>
      )}
      <div className={styles.row2}>
        <TextField
          label="Full name"
          autoFocus
          error={errors.fullName?.message}
          {...register("fullName")}
        />
        <TextField label="Title" error={errors.title?.message} {...register("title")} />
      </div>
      <TextField
        label="LinkedIn profile link"
        placeholder="https://www.linkedin.com/in/…"
        hint="The public profile link (linkedin.com/in/…). Used to stop duplicates."
        error={errors.linkedinUrl?.message}
        {...register("linkedinUrl")}
      />
      <TextField
        label="Sales Navigator link (optional)"
        placeholder="https://www.linkedin.com/sales/lead/…"
        error={errors.salesNavUrl?.message}
        {...register("salesNavUrl")}
      />
      <div className={fieldStyles.field}>
        <TextField
          label="Company"
          list={companiesId}
          autoComplete="off"
          hint="Pick an existing company or type a new one."
          error={errors.companyName?.message}
          {...register("companyName")}
        />
        <datalist id={companiesId}>
          {options.companies.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className={styles.row2}>
        <SelectField
          label="Persona"
          options={choices(options.personas, "No persona")}
          {...register("personaId")}
        />
        <SelectField label="Level" options={plain(LEVELS, "Not set")} {...register("level")} />
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
        {...register("seniority")}
      />
      <div className={styles.row2}>
        <SelectField
          label="Account filter"
          options={choices(options.accountFilters, "No account filter")}
          {...register("accountFilterId")}
        />
        <TextField
          label="Market / country"
          error={errors.market?.message}
          {...register("market")}
        />
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
      <TextArea label="Notes" rows={3} error={errors.notes?.message} {...register("notes")} />
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
      <div className={styles.formActions}>
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
