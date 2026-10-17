import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
  CHANNEL_CONDITIONS,
  ENROLMENT_STATUSES,
  LIBRARY_STATUSES,
  LIBRARY_TYPES,
  PLAN_TYPES,
  PROPOSAL_STATUSES,
  STEP_CHANNELS,
  TEMPLATE_PURPOSES,
} from "../enums";
import { baseColumns, flag, oneOf, oneOfOrNull, timestamp } from "./_shared";
import { user } from "./auth";
import { person } from "./person";
import { persona } from "./persona";
import { template } from "./template";

// Plans (F17): an ordered list of steps per version; people are enrolled in one version.

export const plan = sqliteTable(
  "plan",
  {
    ...baseColumns(() => user.id),
    name: text("name").notNull(),
    planType: text("plan_type", { enum: PLAN_TYPES }).notNull(),
    personaId: text("persona_id").references(() => persona.id, { onDelete: "restrict" }),
    // Official or Personal, as in the library.
    type: text("type", { enum: LIBRARY_TYPES }).notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: LIBRARY_STATUSES }).notNull().default("Active"),
    proposalStatus: text("proposal_status", { enum: PROPOSAL_STATUSES }).notNull().default("None"),
    currentVersion: integer("current_version").notNull().default(1),
    skipWeekends: flag("skip_weekends").notNull().default(true),
  },
  (t) => [
    check("plan_type_check", oneOf("type", LIBRARY_TYPES)),
    check("plan_plan_type_check", oneOf("plan_type", PLAN_TYPES)),
    check("plan_status_check", oneOf("status", LIBRARY_STATUSES)),
    check("plan_proposal_status_check", oneOf("proposal_status", PROPOSAL_STATUSES)),
    check("plan_skip_weekends_check", sql`${t.skipWeekends} IN (0, 1)`),
    index("plan_owner_idx").on(t.ownerId),
  ],
);

/** One channel option of a step; the first that applies is used (D-033). */
export type ChannelOption = {
  channel: (typeof STEP_CHANNELS)[number];
  when: (typeof CHANNEL_CONDITIONS)[number];
};

export const planStep = sqliteTable(
  "plan_step",
  {
    ...baseColumns(() => user.id),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    stepOrder: integer("step_order").notNull(),
    // Ordered channel options, as JSON: [{ channel, when }].
    channels: text("channels", { mode: "json" }).$type<ChannelOption[]>().notNull(),
    templatePurpose: text("template_purpose", { enum: TEMPLATE_PURPOSES }),
    templateId: text("template_id").references(() => template.id, { onDelete: "restrict" }),
    // Call script, task text, or the note sent with a connection request.
    script: text("script"),
    waitDays: integer("wait_days").notNull().default(0),
  },
  (t) => [
    unique("plan_step_unique").on(t.planId, t.version, t.stepOrder),
    check("plan_step_purpose_check", oneOfOrNull("template_purpose", TEMPLATE_PURPOSES)),
    check("plan_step_wait_check", sql`${t.waitDays} >= 0`),
  ],
);

export const planEnrolment = sqliteTable(
  "plan_enrolment",
  {
    ...baseColumns(() => user.id),
    personId: text("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "restrict" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: text("status", { enum: ENROLMENT_STATUSES }).notNull().default("Active"),
    // 1-based order of the next step to do; more than the step count = all steps done.
    currentStep: integer("current_step").notNull().default(1),
    // Plain IST dates, YYYY-MM-DD.
    nextDueDate: text("next_due_date"),
    waitingForAcceptance: flag("waiting_for_acceptance").notNull().default(false),
    requestSentDate: text("request_sent_date"),
    acceptedDate: text("accepted_date"),
    endsBy: text("ends_by"),
    callAttempts: integer("call_attempts").notNull().default(0),
    startedAt: timestamp("started_at").notNull(),
    pausedAt: timestamp("paused_at"),
    endedAt: timestamp("ended_at"),
    endReason: text("end_reason"),
  },
  (t) => [
    check("plan_enrolment_status_check", oneOf("status", ENROLMENT_STATUSES)),
    check("plan_enrolment_waiting_check", sql`${t.waitingForAcceptance} IN (0, 1)`),
    // At most one Active or Paused plan per person (PRD), enforced by the database.
    uniqueIndex("plan_enrolment_one_live")
      .on(t.personId)
      .where(sql`${t.status} IN ('Active', 'Paused')`),
    index("plan_enrolment_plan_idx").on(t.planId),
    index("plan_enrolment_due_idx").on(t.nextDueDate),
  ],
);
