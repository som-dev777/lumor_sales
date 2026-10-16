// Allowed values for every fixed list in the PRD (docs/data-model.md → Enumerations).
// The database enforces these with CHECK constraints; Zod schemas reuse the same arrays.

export const ROLES = ["Admin", "User"] as const;
export type Role = (typeof ROLES)[number];

export const LIBRARY_TYPES = ["Official", "Personal"] as const;
export const LIBRARY_STATUSES = ["Active", "Archived"] as const;
export const PROPOSAL_STATUSES = ["None", "Proposed", "Approved", "Rejected"] as const;

export const SENIORITIES = [
  "Entry Level",
  "Senior",
  "Entry Level Manager",
  "Experienced Manager",
  "Director",
  "Vice President",
  "CXO",
  "Owner / Partner",
] as const;

export const LEVELS = ["Leader", "Practitioner"] as const;
export const TEMPLATE_LEVELS = ["Leader", "Practitioner", "Any"] as const;
export const TIERS = [1, 2, 3] as const;

export const COMPANY_STATUSES = ["Target", "Engaged", "Customer", "Lost"] as const;

export const STAGES = [
  "Prospect",
  "Request sent",
  "Connected",
  "Messaged",
  "Replied",
  "Demo booked",
  "Demo done",
  "Trial/Pilot",
  "Paid",
  "Lost",
] as const;
export type Stage = (typeof STAGES)[number];

export const LOST_REASONS = [
  "No budget",
  "Using competitor",
  "Not a priority",
  "No response",
  "Wrong person",
  "Other",
] as const;

export const SEQUENCE_STEPS = [
  "Not started",
  "Warm-up",
  "Request sent",
  "Message 1",
  "Follow-up 1",
  "Follow-up 2",
  "Break-up",
  "Nurture",
  "Stopped (replied)",
] as const;

export const ACTIVITY_TYPES = [
  "Profile viewed",
  "Post engaged",
  "Request sent",
  "Request accepted",
  "Request withdrawn",
  "Message sent",
  "Reply received",
  "InMail sent",
  "Demo booked",
  "Demo held",
  "Meeting note",
  "Stage change",
  "Deal update",
] as const;

export const CHANNELS = ["LinkedIn", "InMail", "Email", "Call", "In person"] as const;

export const REPLY_TYPES = [
  "Interested",
  "Asking for details",
  "Not now",
  "Objection",
  "Using a competitor",
  "Not interested",
] as const;

export const TEMPLATE_PURPOSES = [
  "Message 1",
  "Follow-up 1",
  "Follow-up 2",
  "Break-up",
  "Reply – interested",
  "Reply – details",
  "Reply – not now",
  "Reply – competitor",
  "Post-demo recap",
  "InMail",
] as const;

export const TEMPLATE_VERSIONS = ["A", "B", "C"] as const;
export const EDIT_LEVELS = ["None", "Light", "Heavy"] as const;

export const PROPOSAL_ITEM_TYPES = ["Persona", "AccountFilter", "Template"] as const;
export const PROPOSAL_DECISIONS = ["Pending", "Approved", "Rejected"] as const;

export const AUDIT_ACTIONS = [
  "Created",
  "Updated",
  "Deleted",
  "Approved",
  "Rejected",
  "Reassigned",
  "Role changed",
  "Deactivated",
  "Reactivated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
