// The Today planner's sections, in order (F08 v2, PRD "F08 Today (revised)" + D-033; Backlog
// from D-043). Shared by the server rules and the page.
export const SECTIONS = [
  { key: "backlog", label: "Backlog (from earlier days)" },
  { key: "reply", label: "Replies waiting" },
  { key: "meeting", label: "Meetings today" },
  { key: "deadline", label: "Expired reply deadlines" },
  { key: "due", label: "Plan steps due today" },
  // Any other next action due today (D-044).
  { key: "followup", label: "Follow-ups due" },
  { key: "trial", label: "Trial check-ins" },
  { key: "finished", label: "Plans finished with no reply" },
  { key: "nurture", label: "Nurture checks" },
  // Active people with no follow-up date (D-044).
  { key: "nodate", label: "Needs a follow-up date" },
  { key: "stale", label: "Stale leads (not on a plan)" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

/** What a backlog task was before it went late, in words. */
export const ORIGIN_LABEL: Partial<Record<SectionKey, string>> = {
  reply: "Reply to answer",
  meeting: "Meeting",
  deadline: "Nudge",
  due: "Plan step",
  followup: "Follow-up",
  trial: "Trial check-in",
};
