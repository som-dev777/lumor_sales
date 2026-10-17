"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { TEMPLATE_LEVELS, TEMPLATE_PURPOSES, TEMPLATE_VERSIONS } from "@/lib/db/enums";
import {
  placeholdersIn,
  templateSchema,
  type TemplateData,
  type TemplateInput,
} from "@/lib/validation/library";
import { createLibraryItem, updateLibraryItem } from "@/server/actions/library";
import type { FormTarget } from "./LibraryForm";
import styles from "./library.module.scss";

export type PersonaChoice = { id: string; name: string; type: string };

export const EMPTY_TEMPLATE: TemplateInput = {
  name: "",
  purpose: "Message 1",
  personaId: "",
  level: "Any",
  version: "A",
  body: "",
};

const options = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

type Props = {
  target: FormTarget;
  defaultValues: TemplateInput;
  personas: PersonaChoice[];
  onDone: () => void;
};

export function TemplateForm({ target, defaultValues, personas, onDone }: Props) {
  const notify = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TemplateInput, unknown, TemplateData>({
    resolver: zodResolver(templateSchema),
    defaultValues,
  });
  const { formError, apply } = useServerResult(setError);
  const body = useWatch({ control, name: "body" }) ?? "";
  const found = placeholdersIn(body);

  const personaOptions = [
    { value: "", label: "Any persona" },
    ...personas.map((p) => ({
      value: p.id,
      label: p.type === "Official" ? p.name : `${p.name} (Personal)`,
    })),
  ];

  const onSubmit = handleSubmit(async (values) => {
    const result =
      target.mode === "edit"
        ? await updateLibraryItem("template", target.id, values)
        : await createLibraryItem("template", target.type, values);
    apply(result);
    if (result.ok) {
      notify("success", result.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField label="Name" autoFocus error={errors.name?.message} {...register("name")} />
      <div className={styles.row3}>
        <SelectField
          label="Purpose"
          options={options(TEMPLATE_PURPOSES)}
          error={errors.purpose?.message}
          {...register("purpose")}
        />
        <SelectField
          label="Level"
          options={options(TEMPLATE_LEVELS)}
          error={errors.level?.message}
          {...register("level")}
        />
        <SelectField
          label="Version"
          options={options(TEMPLATE_VERSIONS)}
          error={errors.version?.message}
          {...register("version")}
        />
      </div>
      <SelectField
        label="Persona"
        options={personaOptions}
        error={errors.personaId?.message}
        {...register("personaId")}
      />
      <TextArea
        label="Message"
        rows={6}
        hint="Use {Name}, {Company}, {topic} or any {placeholder}; they're filled in when drafting a message."
        error={errors.body?.message}
        {...register("body")}
      />
      <p className={styles.owner}>
        Placeholders found: {found.length ? found.map((p) => `{${p}}`).join(", ") : "none"}
        {target.mode === "edit" && " · Changing the wording saves the old wording as a revision."}
      </p>
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {target.mode === "edit" ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
