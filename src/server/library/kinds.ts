// Names for the three library kinds. No server-only imports, so pages and browser code can use it.
export type LibraryKind = "persona" | "accountFilter" | "template";

/** How each kind is named in the audit log and on the Approvals page. */
export const KIND_LABEL = {
  persona: "Persona",
  accountFilter: "AccountFilter",
  template: "Template",
} as const;

/** How each kind is named in sentences. */
export const KIND_NOUN = {
  persona: "persona",
  accountFilter: "account filter",
  template: "template",
} as const;
