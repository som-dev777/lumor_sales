// Labels and explanations for the settings pages and forms (F12, F13). No server imports.
export const FACT_LABELS = {
  whatLumorDoes: { label: "What Lumor does", hint: "A short plain description of the product." },
  liveFeatures: { label: "Live features", hint: "Works today. The AI may mention only these." },
  featuresNotLive: {
    label: "Features not live yet",
    hint: "Planned or beta. The AI must never promise these.",
  },
  pricingGuidance: { label: "Pricing guidance", hint: "What may be said about price." },
  positioningRules: {
    label: "Positioning rules",
    hint: "How to talk about Lumor and competitors.",
  },
  calendarLink: { label: "Calendar link", hint: "The demo booking link (https://…)." },
} as const;

export const PLAYBOOK_LABELS = {
  followUp1DelayDays: {
    label: "Follow-up 1 delay",
    hint: "Days after Message 1 to send Follow-up 1.",
    unit: "days",
  },
  followUp2DelayDays: {
    label: "Follow-up 2 delay",
    hint: "Days after Message 1 to send Follow-up 2.",
    unit: "days",
  },
  breakUpDelayDays: {
    label: "Break-up delay",
    hint: "Days after Message 1 to send the break-up message.",
    unit: "days",
  },
  withdrawAfterDays: {
    label: "Withdraw unaccepted request after",
    hint: "Days a connection request can wait before it's withdrawn.",
    unit: "days",
  },
  dailyConnectionTarget: {
    label: "Daily connection request target",
    hint: "Connection requests each rep aims to send per day.",
    unit: "per day",
  },
  dailyMessageTarget: {
    label: "Daily new-message target",
    hint: "First messages each rep aims to send per day.",
    unit: "per day",
  },
  staleLeadDays: {
    label: "Stale-lead threshold",
    hint: "Days with no activity before a lead counts as stale.",
    unit: "days",
  },
} as const;
