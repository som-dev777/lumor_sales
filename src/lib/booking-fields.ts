// The booking form's standard fields (F22 round 3, D-043), shared by the event editor, the
// public booking page and the server. Work email and name always show and are required; the
// others each have Show and Required switches on the event.
import type { StandardField } from "./db/enums";

export type FieldRule = { show: boolean; required: boolean };
export type FieldRules = Record<StandardField, FieldRule>;

/** Defaults for a new event, and for events made before 2.7.0 (nothing disappears). */
export const DEFAULT_FIELDS: FieldRules = {
  company: { show: true, required: true },
  phone: { show: true, required: false },
  linkedin: { show: true, required: false },
  mode: { show: true, required: true },
};

export const FIELD_LABELS: Record<StandardField, string> = {
  company: "Company",
  phone: "Phone",
  linkedin: "LinkedIn profile",
  mode: "How would you like to meet? (online or in person)",
};

/** An event's field rules, with the defaults filled in. A hidden field is never required. */
export function fieldRules(saved: Partial<FieldRules> | null | undefined): FieldRules {
  const out = { ...DEFAULT_FIELDS };
  for (const k of Object.keys(DEFAULT_FIELDS) as StandardField[]) {
    const r = saved?.[k];
    if (r) out[k] = { show: Boolean(r.show), required: Boolean(r.show && r.required) };
  }
  return out;
}

export const MODE_LABELS = { online: "Online", in_person: "In person" } as const;

/** Compares choices loosely: spaces, letter case, accents and odd dashes or quotes don't matter. */
export function choiceKey(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‐-―]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The event's own spelling of a picked choice, or null when it isn't one of them. */
export function matchChoice(options: readonly string[] | undefined, picked: string): string | null {
  const key = choiceKey(picked);
  if (!key) return null;
  return (options ?? []).find((o) => choiceKey(o) === key) ?? null;
}
