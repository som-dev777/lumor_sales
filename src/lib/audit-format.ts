// Turning audit "changes" into words people can read (Audit Log page, CSV, change history).
import { formatIst } from "./time";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** "mustChangePassword" → "Must change password". */
export function fieldLabel(field: string): string {
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A before/after value as text: empty → "—", true → "Yes", dates in IST, lists joined. */
export function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string")
    return ISO_DATE_TIME.test(value) ? formatIst(new Date(value)) : value;
  if (Array.isArray(value)) return value.length ? value.map(formatChangeValue).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * All changes on one line. New records list their values ("Name: Asha; Role: User");
 * changed records show before → after ("Role: User → Admin").
 */
export function summariseChanges(
  changes: Record<string, { before: unknown; after: unknown }>,
): string {
  const entries = Object.entries(changes);
  const isNew = entries.every(([, v]) => v.before === null || v.before === undefined);
  return entries
    .map(([k, v]) =>
      isNew
        ? `${fieldLabel(k)}: ${formatChangeValue(v.after)}`
        : `${fieldLabel(k)}: ${formatChangeValue(v.before)} → ${formatChangeValue(v.after)}`,
    )
    .join("; ");
}
