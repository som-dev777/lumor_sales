"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { DEFAULT_FIELDS, FIELD_LABELS } from "@/lib/booking-fields";
import { MEETING_LENGTHS, STANDARD_FIELDS, type QuestionType } from "@/lib/db/enums";
import {
  MAX_QUESTIONS,
  meetingTypeSchema,
  toSlug,
  type MeetingTypeData,
  type MeetingTypeInput,
} from "@/lib/validation/calendar";
import { saveMeetingTypeAction } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

export const NEW_MEETING_TYPE: MeetingTypeInput = {
  name: "",
  slug: "",
  durationMin: 30,
  description: "",
  location: "",
  // No gaps between meetings (D-048).
  bufferMin: 0,
  // Same-day booking by default (D-051).
  minNoticeHours: 0,
  maxDaysAhead: 30,
  maxPerDay: "",
  googleMeet: true,
  questions: [],
  standardFields: DEFAULT_FIELDS,
  emailName: "",
  emailNote: "",
  inPersonAddress: "",
};

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short: "Short answer",
  paragraph: "Paragraph",
  dropdown: "Dropdown (pick one)",
  checkboxes: "Checkboxes (pick any)",
};

/** "New event" or "Edit" with the form in a dialog (F22; "events" from D-043). */
export function MeetingTypeDialog({
  meetingTypeId,
  defaults,
  name,
  googleReady = false,
}: {
  meetingTypeId?: string;
  defaults?: MeetingTypeInput;
  name?: string;
  /** The rep has Google Calendar connected (F26). */
  googleReady?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {meetingTypeId ? (
        <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Edit ${name}`}>
          <Pencil size={16} aria-hidden /> Edit
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden /> New event
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={meetingTypeId ? "Edit event" : "New event"}
        description="People book this from its link. Times are in India time (IST) on your side."
      >
        {open && (
          <MeetingTypeForm
            meetingTypeId={meetingTypeId ?? null}
            defaults={defaults ?? NEW_MEETING_TYPE}
            googleReady={googleReady}
            onDone={() => setOpen(false)}
          />
        )}
      </Dialog>
    </>
  );
}

function MeetingTypeForm({
  meetingTypeId,
  defaults,
  googleReady,
  onDone,
}: {
  meetingTypeId: string | null;
  defaults: MeetingTypeInput;
  googleReady: boolean;
  onDone: () => void;
}) {
  const notify = useToast();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MeetingTypeInput, unknown, MeetingTypeData>({
    resolver: zodResolver(meetingTypeSchema),
    // A new event gets a random link code, so renaming it never changes the link (D-045).
    defaultValues: meetingTypeId || defaults.slug ? defaults : { ...defaults, slug: randomSlug() },
  });
  const questions = useFieldArray({ control, name: "questions" });
  const duration = Number(useWatch({ control, name: "durationMin" }));
  const [custom, setCustom] = useState(
    !(MEETING_LENGTHS as readonly number[]).includes(Number(defaults.durationMin)),
  );
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    const r = await saveMeetingTypeAction(meetingTypeId, values);
    apply(r);
    if (r.ok) {
      notify("success", r.message ?? "Saved.");
      onDone();
    }
  });

  return (
    <form className={styles.stack} onSubmit={onSubmit} noValidate>
      {formError && <Alert tone="error">{formError}</Alert>}
      <div className={styles.grid2}>
        <TextField
          label="Name"
          placeholder="e.g. Lumor demo"
          autoFocus
          error={errors.name?.message}
          {...register("name")}
        />
        <TextField
          label="Link code"
          hint="The end of the booking link. It doesn't change when you rename the event, so links you've shared keep working."
          error={errors.slug?.message}
          {...register("slug", { onBlur: () => setValue("slug", toSlug(getValues("slug"), "")) })}
        />
      </div>
      <div className={styles.grid3}>
        <SelectField
          label="Length"
          value={custom ? "custom" : String(duration)}
          options={[
            ...MEETING_LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` })),
            { value: "custom", label: "Custom…" },
          ]}
          error={custom ? undefined : errors.durationMin?.message}
          onChange={(e) => {
            if (e.target.value === "custom") {
              setCustom(true);
              return;
            }
            setCustom(false);
            setValue("durationMin", Number(e.target.value), { shouldValidate: true });
          }}
        />
        {custom && (
          <TextField
            label="Custom length (minutes)"
            type="number"
            min={5}
            max={240}
            step={5}
            error={errors.durationMin?.message}
            {...register("durationMin")}
          />
        )}
        <TextField
          label="Minimum notice (hours)"
          type="number"
          min={0}
          max={72}
          error={errors.minNoticeHours?.message}
          {...register("minNoticeHours")}
        />
        <TextField
          label="Book up to (days ahead)"
          type="number"
          min={1}
          max={90}
          error={errors.maxDaysAhead?.message}
          {...register("maxDaysAhead")}
        />
        <TextField
          label="Limit per day (optional)"
          type="number"
          min={1}
          max={20}
          error={errors.maxPerDay?.message}
          {...register("maxPerDay")}
        />
      </div>
      <div className={styles.grid2}>
        <TextField
          label="Online: meeting link or phone (optional)"
          placeholder="Zoom link or phone number, when there's no Google Meet"
          error={errors.location?.message}
          {...register("location")}
        />
        <TextField
          label="In person: address (optional)"
          placeholder="e.g. Lumor, 3rd floor, Indiranagar, Bengaluru"
          hint="Used when someone picks In person. Empty: you confirm the place."
          error={errors.inPersonAddress?.message}
          {...register("inPersonAddress")}
        />
      </div>
      <TextArea
        label="Description (optional)"
        rows={3}
        placeholder="What you'll cover, shown on the booking page."
        error={errors.description?.message}
        {...register("description")}
      />
      <label className={styles.checkRow}>
        <input type="checkbox" {...register("googleMeet")} /> Create a Google Meet link for each
        booking
      </label>
      <p className={styles.muted}>
        {googleReady
          ? "Your Google Calendar is connected: each booking gets its own Meet link."
          : "Needs Google Calendar connected (Calendar → Availability). Until then, people get the online link above."}
      </p>
      <div className={styles.stack}>
        <h3 className={styles.sectionTitle}>Emails</h3>
        <div className={styles.grid2}>
          <TextField
            label="Name in emails (optional)"
            placeholder="e.g. Lumor demo"
            hint="“You’re booked: Lumor demo on…”. Empty: the event's name."
            error={errors.emailName?.message}
            {...register("emailName")}
          />
        </div>
        <TextArea
          label="Note in emails (optional)"
          rows={2}
          placeholder="e.g. To get the most from the 30 minutes, have a study you’re working on to hand."
          error={errors.emailNote?.message}
          {...register("emailNote")}
        />
      </div>
      <div className={styles.stack}>
        <h3 className={styles.sectionTitle}>Booking form</h3>
        <p className={styles.muted}>
          Work email and name are always asked and required (the confirmation and reminders go to
          that email). Choose which of the others show and which are required.
        </p>
        <table className={styles.fieldTable} aria-label="Standard fields">
          <thead>
            <tr>
              <th>Field</th>
              <th>Show</th>
              <th>Required</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Work email</td>
              <td>
                <input type="checkbox" checked disabled aria-label="Show Work email" />
              </td>
              <td>
                <input type="checkbox" checked disabled aria-label="Work email required" />
              </td>
            </tr>
            <tr>
              <td>Your name</td>
              <td>
                <input type="checkbox" checked disabled aria-label="Show Your name" />
              </td>
              <td>
                <input type="checkbox" checked disabled aria-label="Your name required" />
              </td>
            </tr>
            {STANDARD_FIELDS.map((f) => (
              <FieldRow key={f} control={control} field={f} register={register} />
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.stack}>
        <h3 className={styles.sectionTitle}>Your questions</h3>
        <p className={styles.muted}>
          Up to {MAX_QUESTIONS} questions of your own, after the fields above.
        </p>
        {typeof errors.questions?.message === "string" && (
          <Alert tone="error">{errors.questions.message}</Alert>
        )}
        {questions.fields.map((f, i) => (
          <div key={f.id} className={styles.questionCard}>
            <div className={styles.question}>
              <TextField
                label={`Question ${i + 1}`}
                error={errors.questions?.[i]?.label?.message}
                {...register(`questions.${i}.label`)}
              />
              <SelectField
                label="Type"
                options={Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
                {...register(`questions.${i}.type`)}
              />
              <Button
                variant="ghost"
                aria-label={`Remove question ${i + 1}`}
                onClick={() => questions.remove(i)}
              >
                <Trash2 size={16} aria-hidden />
              </Button>
            </div>
            <ChoicesField
              control={control}
              index={i}
              error={errors.questions?.[i]?.options?.message}
            />
            <label className={styles.checkRow}>
              <input type="checkbox" {...register(`questions.${i}.required`)} /> Required
            </label>
          </div>
        ))}
        {questions.fields.length < MAX_QUESTIONS && (
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                questions.append({ label: "", required: false, type: "short", options: [] })
              }
            >
              <Plus size={16} aria-hidden /> Add a question
            </Button>
          </div>
        )}
      </div>
      <div className={styles.formActions}>
        <Button variant="secondary" onClick={onDone} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {meetingTypeId ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}

/** The choices of a dropdown or checkboxes question, one per line. */
function ChoicesField({
  control,
  index,
  error,
}: {
  control: Control<MeetingTypeInput, unknown, MeetingTypeData>;
  index: number;
  error?: string;
}) {
  const type = useWatch({ control, name: `questions.${index}.type` });
  if (type !== "dropdown" && type !== "checkboxes") return null;
  return (
    <Controller
      control={control}
      name={`questions.${index}.options`}
      render={({ field }) => (
        <TextArea
          label="Choices (one per line)"
          rows={4}
          placeholder={"e.g.\n1–10 people\n11–50 people\n51+ people"}
          value={(field.value ?? []).join("\n")}
          onChange={(e) => field.onChange(e.target.value.split("\n"))}
          onBlur={field.onBlur}
          error={error}
        />
      )}
    />
  );
}

/** One standard field's Show and Required switches (D-043). Hidden fields can't be required. */
function FieldRow({
  control,
  field,
  register,
}: {
  control: Control<MeetingTypeInput, unknown, MeetingTypeData>;
  field: (typeof STANDARD_FIELDS)[number];
  register: ReturnType<typeof useForm<MeetingTypeInput, unknown, MeetingTypeData>>["register"];
}) {
  const shown = useWatch({ control, name: `standardFields.${field}.show` });
  const label = FIELD_LABELS[field];
  return (
    <tr>
      <td>{label}</td>
      <td>
        <input
          type="checkbox"
          aria-label={`Show ${label}`}
          {...register(`standardFields.${field}.show`)}
        />
      </td>
      <td>
        {/* Not disabled (the form would drop its value); a hidden field is never required. */}
        <input
          type="checkbox"
          aria-label={`${label} required`}
          className={shown ? undefined : styles.dim}
          {...register(`standardFields.${field}.required`)}
        />
      </td>
    </tr>
  );
}

/** "k7m2q9xa": 8 random lower-case letters and digits for a new event's link (D-045). */
function randomSlug(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}
