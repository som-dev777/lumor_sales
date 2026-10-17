"use client";

import type { LibraryKind } from "@/server/library/kinds";
import type { PersonaOptions } from "@/server/library/queries";
import { AccountFilterForm, EMPTY_ACCOUNT_FILTER } from "./AccountFilterForm";
import { EMPTY_PERSONA, PersonaForm } from "./PersonaForm";
import { EMPTY_TEMPLATE, TemplateForm, type PersonaChoice } from "./TemplateForm";

export type FormTarget =
  { mode: "edit"; id: string } | { mode: "create"; type: "Official" | "Personal" };

type Props = {
  kind: LibraryKind;
  target: FormTarget;
  /** The item's current values when editing (shape depends on the kind). */
  values?: unknown;
  /** Extra choices the form needs (e.g. persona options), loaded by the page. */
  formOptions?: unknown;
  onDone: () => void;
};

/** The right add/edit form for each kind of library item. */
export function LibraryForm({ kind, target, values, formOptions, onDone }: Props) {
  switch (kind) {
    case "persona":
      return (
        <PersonaForm
          target={target}
          defaultValues={(values as typeof EMPTY_PERSONA | undefined) ?? EMPTY_PERSONA}
          options={formOptions as PersonaOptions | undefined}
          onDone={onDone}
        />
      );
    case "accountFilter":
      return (
        <AccountFilterForm
          target={target}
          defaultValues={
            (values as typeof EMPTY_ACCOUNT_FILTER | undefined) ?? EMPTY_ACCOUNT_FILTER
          }
          onDone={onDone}
        />
      );
    case "template":
      return (
        <TemplateForm
          target={target}
          defaultValues={(values as typeof EMPTY_TEMPLATE | undefined) ?? EMPTY_TEMPLATE}
          personas={(formOptions as PersonaChoice[] | undefined) ?? []}
          onDone={onDone}
        />
      );
  }
}
