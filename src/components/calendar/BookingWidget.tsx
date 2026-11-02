"use client";

import { ArrowLeft, CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import fieldStyles from "@/components/ui/TextField.module.scss";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import type { BookingQuestion } from "@/lib/db/schema/calendar";
import { bookingFormSchema, checkAnswers } from "@/lib/validation/calendar";
import { bookSlot } from "@/server/actions/calendar";
import { PhoneField } from "./PhoneField";
import { formatDay, formatTime, SlotPicker, useTimeZone, zoneName } from "./SlotPicker";
import styles from "./calendar.module.scss";

type Answer = string | string[];

/** The public booking page's picker and form (F22). No sign-in. */
export function BookingWidget({
  profileSlug,
  typeSlug,
  slots,
  questions,
  durationMin,
}: {
  profileSlug: string;
  typeSlug: string;
  slots: string[];
  questions: BookingQuestion[];
  durationMin: number;
}) {
  const router = useRouter();
  const tz = useTimeZone();
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [values, setValues] = useState({
    name: "",
    email: "",
    company: "",
    phoneCountry: "IN",
    phone: "",
    linkedin: "",
    website: "",
  });
  const [answers, setAnswers] = useState<Answer[]>(
    questions.map((q) => (q.type === "checkboxes" ? [] : "")),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const setAnswer = (i: number, a: Answer) =>
    setAnswers((all) => all.map((x, j) => (j === i ? a : x)));

  if (step === "pick" || !slot) {
    return (
      <div className={styles.stack}>
        <h2 className={styles.stepTitle}>Pick a day and time</h2>
        <SlotPicker
          slots={slots}
          value={slot}
          tz={tz}
          onChange={(iso) => {
            setSlot(iso);
            setStep("form");
            setError(null);
          }}
        />
      </div>
    );
  }

  const start_ = new Date(slot);
  const end = new Date(start_.getTime() + durationMin * 60_000);
  const when = `${formatDay(start_, tz.zone, true)}, ${formatTime(start_, tz.zone)} – ${formatTime(end, tz.zone)}`;

  /** Checks the form in the browser first, with the same rules as the server. */
  function check(): Record<string, string> {
    const found: Record<string, string> = {};
    const parsed = bookingFormSchema.safeParse({
      ...values,
      startsAt: slot,
      answers,
      timeZone: tz.zone,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !found[key]) found[key] = issue.message;
      }
    }
    const a = checkAnswers(questions, answers);
    if (!a.ok) found[`answers.${a.index}`] = a.message;
    return found;
  }

  return (
    <form
      className={styles.stack}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const found = check();
        setErrors(found);
        if (Object.keys(found).length > 0) {
          setError("Please fix the highlighted fields.");
          return;
        }
        start(async () => {
          const r = await bookSlot(profileSlug, typeSlug, {
            ...values,
            startsAt: slot,
            answers,
            timeZone: tz.zone,
          });
          if (r.ok) {
            router.push(`/booking/${r.token}?new=1`);
            return;
          }
          setError(r.error);
          setErrors(r.fieldErrors ?? {});
          if (/taken/i.test(r.error)) {
            setStep("pick");
            setSlot(null);
            router.refresh();
          }
        });
      }}
    >
      <div className={styles.chosen}>
        <CalendarCheck size={20} aria-hidden />
        <div>
          <strong>{when}</strong>
          <span className={styles.muted}>{zoneName(tz.zone)}</span>
        </div>
        <Button variant="ghost" onClick={() => setStep("pick")} disabled={busy}>
          <ArrowLeft size={16} aria-hidden /> Change
        </Button>
      </div>
      <h2 className={styles.stepTitle}>Your details</h2>
      {error && <Alert tone="error">{error}</Alert>}
      <div className={styles.grid2}>
        <TextField
          label="Your name"
          required
          autoComplete="name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <TextField
          label="Work email"
          required
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="name@company.com"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
        <TextField
          label="Company"
          required
          autoComplete="organization"
          value={values.company}
          onChange={set("company")}
          error={errors.company}
        />
        <PhoneField
          label="Phone (optional)"
          country={values.phoneCountry}
          number={values.phone}
          onCountry={(c) => setValues((v) => ({ ...v, phoneCountry: c }))}
          onNumber={(n) => setValues((v) => ({ ...v, phone: n }))}
          error={errors.phone}
        />
      </div>
      <TextField
        label="LinkedIn profile (optional)"
        placeholder="https://www.linkedin.com/in/…"
        inputMode="url"
        value={values.linkedin}
        onChange={set("linkedin")}
        error={errors.linkedin}
      />
      {questions.map((q, i) => (
        <QuestionField
          key={`${i}-${q.label}`}
          q={q}
          value={answers[i]}
          onChange={(a) => setAnswer(i, a)}
          error={errors[`answers.${i}`]}
        />
      ))}
      {/* Robots fill this in; people never see it. */}
      <div className={styles.trap} aria-hidden>
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={values.website}
            onChange={set("website")}
          />
        </label>
      </div>
      <p className={styles.muted}>
        <span className={fieldStyles.req}>*</span> Required
      </p>
      <div className={styles.formActions}>
        <Button type="submit" loading={busy} className={styles.bigButton}>
          Confirm booking
        </Button>
      </div>
    </form>
  );
}

/** One of the meeting type's questions, by its type. */
function QuestionField({
  q,
  value,
  onChange,
  error,
}: {
  q: BookingQuestion;
  value: Answer;
  onChange: (a: Answer) => void;
  error?: string;
}) {
  const type = q.type ?? "short";
  const text = Array.isArray(value) ? value.join(", ") : value;
  if (type === "paragraph") {
    return (
      <TextArea
        label={q.label}
        required={q.required}
        rows={4}
        maxLength={2000}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
    );
  }
  if (type === "dropdown") {
    return (
      <SelectField
        label={q.label}
        required={q.required}
        value={text}
        options={[
          { value: "", label: "Choose…" },
          ...(q.options ?? []).map((o) => ({ value: o, label: o })),
        ]}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
    );
  }
  if (type === "checkboxes") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <fieldset className={styles.choiceSet} aria-invalid={error ? true : undefined}>
        <legend className={fieldStyles.label}>
          {q.label}
          {q.required && (
            <span className={fieldStyles.req} aria-hidden>
              {" "}
              *
            </span>
          )}
        </legend>
        {(q.options ?? []).map((o) => (
          <label key={o} className={styles.checkRow}>
            <input
              type="checkbox"
              checked={picked.includes(o)}
              onChange={(e) =>
                onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))
              }
            />{" "}
            {o}
          </label>
        ))}
        {error && (
          <p className={fieldStyles.error} role="alert">
            {error}
          </p>
        )}
      </fieldset>
    );
  }
  return (
    <TextField
      label={q.label}
      required={q.required}
      maxLength={300}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  );
}
