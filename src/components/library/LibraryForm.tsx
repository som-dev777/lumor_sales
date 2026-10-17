"use client";

import type { LibraryKind } from "@/server/library/kinds";
import { EMPTY_PERSONA, PersonaForm } from "./PersonaForm";

export type FormTarget =
  { mode: "edit"; id: string } | { mode: "create"; type: "Official" | "Personal" };

type Props = {
  kind: LibraryKind;
  target: FormTarget;
  /** The item's current values when editing (shape depends on the kind). */
  values?: unknown;
  onDone: () => void;
};

/** The right add/edit form for each kind of library item. */
export function LibraryForm({ kind, target, values, onDone }: Props) {
  switch (kind) {
    case "persona":
      return (
        <PersonaForm
          target={target}
          defaultValues={(values as typeof EMPTY_PERSONA | undefined) ?? EMPTY_PERSONA}
          onDone={onDone}
        />
      );
    default:
      return null;
  }
}
