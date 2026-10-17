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

/** Persona "function" choices (D-015: the PRD's Base44 list isn't available). */
export const PERSONA_FUNCTIONS = [
  "Research",
  "Insights",
  "Product",
  "Design",
  "CX",
  "Brand",
  "Marketing",
  "Leadership",
  "Consulting",
] as const;

export const LEVELS = ["Leader", "Practitioner"] as const;
export const TEMPLATE_LEVELS = ["Leader", "Practitioner", "Any"] as const;
export const TIERS = [1, 2, 3] as const;

export const COMPANY_STATUSES = ["Target", "Engaged", "Customer", "Lost"] as const;

/** v2 stages (PRD Version 2 scope; D-029). Lost (with a reason) can be set from any stage. */
export const STAGES = [
  "Prospect",
  "Contacted",
  "Connected",
  "Replied",
  "Meeting scheduled",
  "Meeting done",
  "Proposal sent",
  "Trial",
  "Paid",
  "Active customer",
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

export const ACTIVITY_TYPES = [
  "Profile viewed",
  "Post engaged",
  "Request sent",
  "Request accepted",
  "Request withdrawn",
  "Message sent",
  "Reply received",
  "InMail sent",
  "Meeting booked",
  "Meeting held",
  "Meeting note",
  "Stage change",
  "Deal update",
  "Call",
  "Task done",
  "Plan change",
] as const;

/** "In person" is kept for logging meetings only, never a plan step (D-033). */
export const CHANNELS = ["LinkedIn", "InMail", "Email", "Call", "WhatsApp", "In person"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CALL_OUTCOMES = [
  "Connected",
  "No answer",
  "Call back later",
  "Wrong number",
  "Not interested",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

// --- Plans (F17) ---
export const PLAN_TYPES = ["Outreach", "Meeting follow-up", "Trial", "Onboarding"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const STEP_CHANNELS = [
  "LinkedIn connection request",
  "LinkedIn message",
  "InMail",
  "Email",
  "Call",
  "WhatsApp",
  "Manual task",
] as const;
export type StepChannel = (typeof STEP_CHANNELS)[number];

/** When a step's channel option applies (D-033: an ordered list of options per step). */
export const CHANNEL_CONDITIONS = ["always", "phone", "email"] as const;
export type ChannelCondition = (typeof CHANNEL_CONDITIONS)[number];

export const ENROLMENT_STATUSES = ["Active", "Paused", "Completed", "Stopped"] as const;
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number];

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

export const PROPOSAL_ITEM_TYPES = ["Persona", "AccountFilter", "Template", "Plan"] as const;
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
