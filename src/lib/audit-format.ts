// Turning audit "changes" into words people can read (Audit Log page, CSV, change history).
import { formatIst } from "./time";

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Record ids → names, from server/audit-names.ts. */
export type NameMap = Record<string, string>;

const SPECIAL_LABELS: Record<string, string> = {
  linkedinUrl: "LinkedIn link",
  salesNavUrl: "Sales Navigator link",
  dealValueInr: "Deal value (₹)",
  planTier: "Plan or tier",
  openerTemplateId: "Opener template",
  openerTemplateVersion: "Opener template version",
  accountFilterId: "Account filter",
  invitedBy: "Invited by",
  proposedBy: "Proposed by",
};

/** "mustChangePassword" → "Must change password"; "ownerId" → "Owner". */
export function fieldLabel(field: string): string {
  if (SPECIAL_LABELS[field]) return SPECIAL_LABELS[field];
  const spaced = field
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** A before/after value as text: empty → "—", true → "Yes", dates in IST, ids as names. */
export function formatChangeValue(value: unknown, names: NameMap = {}): string {
  if (isEmptyValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    if (names[value]) return names[value];
    return ISO_DATE_TIME.test(value) ? formatIst(new Date(value)) : value;
  }
  if (Array.isArray(value)) return value.map((v) => formatChangeValue(v, names)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** The fields worth showing: anything where before or after has a value. */
export function meaningfulChanges(changes: Record<string, { before: unknown; after: unknown }>) {
  return Object.entries(changes).filter(
    ([, v]) => !(isEmptyValue(v.before) && isEmptyValue(v.after)),
  );
}

/**
 * All changes on one line. New records list their filled-in values ("Name: Asha; Role: User");
 * changed records show before → after ("Role: User → Admin").
 */
export function summariseChanges(
  changes: Record<string, { before: unknown; after: unknown }>,
  names: NameMap = {},
): string {
  const entries = meaningfulChanges(changes);
  const isNew = entries.every(([, v]) => isEmptyValue(v.before));
  return entries
    .map(([k, v]) =>
      isNew
        ? `${fieldLabel(k)}: ${formatChangeValue(v.after, names)}`
        : `${fieldLabel(k)}: ${formatChangeValue(v.before, names)} → ${formatChangeValue(v.after, names)}`,
    )
    .join("; ");
}
