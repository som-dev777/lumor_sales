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
  withdrawAfterDays: {
    label: "Withdraw unaccepted request after",
    hint: "Days a connection request can wait before Today asks to withdraw it.",
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
    hint: "Days with no activity before a lead not on a plan counts as stale.",
    unit: "days",
  },
  msgAfterAcceptMinDays: {
    label: "Message after accepting: at least",
    hint: "Guardrail 1: wait at least this long after a connection is accepted.",
    unit: "days",
  },
  msgAfterAcceptMaxDays: {
    label: "Message after accepting: at most",
    hint: "Guardrail 1: and no longer than this.",
    unit: "days",
  },
  minGapDays: {
    label: "Smallest gap between touches",
    hint: "Guardrail 2: before a reply; each gap must also be longer than the last.",
    unit: "days",
  },
  maxFollowUps: {
    label: "Follow-ups after Message 1",
    hint: "Guardrail 3: the most an Outreach plan may send, across all channels.",
    unit: "at most",
  },
  weeklyTouchLimit: {
    label: "Touches in any 7 days",
    hint: "Guardrail 4: the most per person in any 7 days.",
    unit: "at most",
  },
  outreachMaxDays: {
    label: "Outreach plan length",
    hint: "Guardrail 7: from acceptance (or the first touch); then Nurture.",
    unit: "days",
  },
  outreachMaxDaysSenior: {
    label: "Outreach plan length for Vice President / CXO",
    hint: "Guardrail 7: senior people reply more slowly.",
    unit: "days",
  },
  nurtureDays: {
    label: "Nurture period",
    hint: "No touches for this long after a plan ends without a reply.",
    unit: "days",
  },
  replyDeadlineMinDays: {
    label: "AI reply deadline: shortest",
    hint: "The AI's suggested reply deadline is never shorter (used from R8).",
    unit: "days",
  },
  replyDeadlineMaxDays: {
    label: "AI reply deadline: longest",
    hint: "The AI's suggested reply deadline is never longer (used from R8).",
    unit: "days",
  },
} as const;
