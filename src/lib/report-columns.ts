// The report's tables and their columns (F19, D-043, D-057), shared by the server (PDF, CSV)
// and the page.
import type { ReportSection } from "./report-shape";
import type { PersonNumbers, ReportData } from "@/server/reports";

/** New outreach and people added are one column since D-063: a new person is new outreach. */
export const NEW_OUTREACH_LABEL = "New outreach (people added)";

export const PIPELINE_COLUMNS: {
  key: "newOutreach" | "companiesAdded" | "followUps" | "replied" | "demosScheduled" | "converted";
  label: string;
}[] = [
  { key: "newOutreach", label: NEW_OUTREACH_LABEL },
  { key: "companiesAdded", label: "Companies added" },
  { key: "followUps", label: "Follow-ups" },
  { key: "replied", label: "Responded" },
  { key: "demosScheduled", label: "Demos scheduled" },
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

/** The number tables on a report, by section (D-057; Replies and outcomes removed in D-063). */
export const NUMBER_SECTIONS = [
  {
    key: "activity",
    title: "Activity",
    keys: ["requests", "messages", "emails", "calls", "callsConnected"],
  },
] as const satisfies readonly {
  key: ReportSection;
  title: string;
  keys: readonly (typeof NUMBER_KEYS)[number][];
}[];

/** The five headline numbers (D-058, D-063), from the report as shown. */
export function headlines(r: ReportData) {
  const p = r.pipeline?.total;
  return [
    { key: "pipeline.total.newOutreach", label: NEW_OUTREACH_LABEL, value: p?.newOutreach ?? null },
    { key: "pipeline.total.followUps", label: "Follow-ups", value: p?.followUps ?? null },
    { key: "pipeline.total.replied", label: "Responded", value: p?.replied ?? null },
    // Reports from before 2.15 have no Demos scheduled column: their meetings booked.
    p?.demosScheduled !== undefined
      ? {
          key: "pipeline.total.demosScheduled",
          label: "Demos scheduled",
          value: p.demosScheduled,
        }
      : {
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
