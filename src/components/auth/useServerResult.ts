"use client";

import { useState } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import type { ActionResult } from "@/lib/action-result";

/**
 * Shows what a Server Action sent back: field errors under their inputs and one message
 * at the top of the form. (A successful action usually redirects instead of returning.)
 */
export function useServerResult<T extends FieldValues>(setError: UseFormSetError<T>) {
  const [formError, setFormError] = useState<string | null>(null);

  function apply(result: ActionResult | undefined) {
    if (!result || result.ok) {
      setFormError(null);
      return;
    }
    setFormError(result.error);
    for (const [field, message] of Object.entries(result.fieldErrors ?? {})) {
      setError(field as Path<T>, { message });
    }
  }

  return { formError, apply, clear: () => setFormError(null) };
}
