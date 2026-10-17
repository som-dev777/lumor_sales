// The Today planner's sections, in order (F08). Shared by the server rules and the page.
export const SECTIONS = [
  { key: "reply", label: "Replies waiting" },
  { key: "demo", label: "Demos today and recaps" },
  { key: "followUp", label: "Follow-ups due" },
  { key: "withdraw", label: "Requests to withdraw" },
  { key: "stale", label: "Stale leads" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
