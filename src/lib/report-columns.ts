// The report's tables and their columns (F19, D-043, D-057), shared by the server (PDF, CSV)
// and the page.
import type { ReportSection } from "./report-shape";
import type { PersonNumbers, ReportData } from "@/server/reports";

export const PIPELINE_COLUMNS: {
  key: "peopleAdded" | "companiesAdded" | "newOutreach" | "followUps" | "replied" | "converted";
  label: string;
}[] = [
  { key: "peopleAdded", label: "People added" },
  { key: "companiesAdded", label: "Companies added" },
  { key: "newOutreach", label: "New outreach" },
  { key: "followUps", label: "Follow-ups" },
  { key: "replied", label: "Replied" },
  { key: "converted", label: "Converted" },
];

export const NUMBER_KEYS = [
  "requests",
  "messages",
  "emails",
  "calls",
  "callsConnected",
  "replies",
  "meetingsBooked",
  "meetingsHeld",
  "proposals",
  "trials",
  "conversions",
  "dealValueInr",
  "stepsDone",
  "stepsOnTime",
  "stepsLate",
  "stepsNotRecorded",
] as const satisfies readonly (keyof PersonNumbers)[];

export const REPORT_COLUMNS: { key: (typeof NUMBER_KEYS)[number]; label: string }[] = [
  { key: "requests", label: "Connection requests" },
  { key: "messages", label: "Messages" },
  { key: "emails", label: "Emails" },
  { key: "calls", label: "Calls" },
  { key: "callsConnected", label: "Calls connected" },
  { key: "replies", label: "Replies" },
  { key: "meetingsBooked", label: "Meetings booked" },
  { key: "meetingsHeld", label: "Meetings held" },
  { key: "proposals", label: "Proposals sent" },
  { key: "trials", label: "Trials" },
  { key: "conversions", label: "Conversions" },
  { key: "dealValueInr", label: "Deal value (INR)" },
  { key: "stepsDone", label: "Plan steps done" },
  { key: "stepsOnTime", label: "On time" },
  { key: "stepsLate", label: "Late" },
  { key: "stepsNotRecorded", label: "Due date not recorded" },
];

/** The three number tables on a report, by section (D-057). */
export const NUMBER_SECTIONS = [
  {
    key: "activity",
    title: "Activity",
    keys: ["requests", "messages", "emails", "calls", "callsConnected"],
  },
  {
    key: "outcomes",
    title: "Replies and outcomes",
    keys: [
      "replies",
      "meetingsBooked",
      "meetingsHeld",
      "proposals",
      "trials",
      "conversions",
      "dealValueInr",
    ],
  },
] as const satisfies readonly {
  key: ReportSection;
  title: string;
  keys: readonly (typeof NUMBER_KEYS)[number][];
}[];

/** The five headline numbers (D-058), from the report as shown. */
export function headlines(r: ReportData) {
  const p = r.pipeline?.total;
  return [
    { key: "pipeline.total.newOutreach", label: "New outreach", value: p?.newOutreach ?? null },
    { key: "pipeline.total.followUps", label: "Follow-ups", value: p?.followUps ?? null },
    { key: "pipeline.total.replied", label: "Responded", value: p?.replied ?? null },
    {
      key: "numbers.total.meetingsBooked",
      label: "Demos scheduled",
      value: r.total.meetingsBooked,
    },
    { key: "numbers.total.meetingsHeld", label: "Demos conducted", value: r.total.meetingsHeld },
  ];
}

/** "Events of the day" for one day, else "Events in this period". */
export const eventsTitle = (r: Pick<ReportData, "from" | "to">) =>
  r.from === r.to ? "Events of the day" : "Events in this period";
