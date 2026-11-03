"use client";

import { ArrowLeft, ArrowRight, CalendarCheck, Clock, Globe, MapPin, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import fieldStyles from "@/components/ui/TextField.module.scss";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { MODE_LABELS, type FieldRules } from "@/lib/booking-fields";
import type { BookingQuestion } from "@/lib/db/schema/calendar";
import {
  bookingFormSchema,
  checkAnswers,
  checkStandardFields,
  formatPhone,
} from "@/lib/validation/calendar";
import { bookSlot } from "@/server/actions/calendar";
import { PhoneField } from "./PhoneField";
import { formatDay, formatTime, SlotPicker, useTimeZone, zoneName } from "./SlotPicker";
import styles from "./calendar.module.scss";

type Answer = string | string[];

export type IntroFact = { icon: "clock" | "video" | "pin" | "globe"; text: string };
const FACT_ICON = { clock: Clock, video: Video, pin: MapPin, globe: Globe };

/** The first step (D-047): what the meeting is, then "Choose a time". */
function Intro({
  intro,
  onNext,
  compact = false,
  onBack,
}: {
  intro: { host: string; title: string; description: string | null; facts: IntroFact[] };
  onNext?: () => void;
  compact?: boolean;
  onBack?: () => void;
}) {
  if (compact) {
    return (
      <div className={styles.introBar}>
        <div>
          <p className={styles.host}>{intro.host}</p>
          <p className={styles.introBarTitle}>{intro.title}</p>
        </div>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={16} aria-hidden /> About this meeting
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className={styles.introCard}>
      <p className={styles.host}>{intro.host}</p>
      <h1 className={styles.bookingTitle}>{intro.title}</h1>
      <ul className={styles.factList}>
        {intro.facts.map((f) => {
          const Icon = FACT_ICON[f.icon];
          return (
            <li key={f.text}>
              <Icon size={16} aria-hidden /> {f.text}
            </li>
          );
        })}
      </ul>
      {intro.description && <p className={styles.description}>{intro.description}</p>}
      <Button className={styles.bigButton} onClick={onNext}>
        Choose a time <ArrowRight size={16} aria-hidden />
      </Button>
    </div>
  );
}

/** The public booking page's picker and form (F22). No sign-in. */
export function BookingWidget({
  profileSlug,
  typeSlug,
  slots,
  taken = [],
  questions,
  durationMin,
  fields,
  address,
  online,
  intro,
}: {
  /** The introduction step: who, what, how long (D-047). */
  intro: { host: string; title: string; description: string | null; facts: IntroFact[] };
  profileSlug: string;
  typeSlug: string;
  slots: string[];
  /** Times already taken: shown greyed out (D-048). */
  taken?: string[];
  questions: BookingQuestion[];
  durationMin: number;
  /** Which standard fields show and which are required (D-043). */
  fields: FieldRules;
  /** The in-person address, when the event has one. */
  address: string | null;
  /** How an online meeting happens, e.g. "Google Meet". */
  online: string;
}) {
  const router = useRouter();
  const tz = useTimeZone();
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"intro" | "pick" | "form">("intro");
  const [values, setValues] = useState({
    name: "",
    email: "",
    company: "",
    phoneCountry: "IN",
    phone: "",
    linkedin: "",
    mode: "",
    website: "",
  });
  const [answers, setAnswers] = useState<Answer[]>(
    questions.map((q) => (q.type === "checkboxes" ? [] : "")),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // Fixing a field clears its message.
  const clear = (key: string) =>
    setErrors((all) => {
      if (!(key in all)) return all;
      const next = { ...all };
      delete next[key];
      return next;
    });
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    clear(k);
  };
  const setAnswer = (i: number, a: Answer) => {
    setAnswers((all) => all.map((x, j) => (j === i ? a : x)));
    clear(`answers.${i}`);
  };

  if (step === "intro") {
    return <Intro intro={intro} onNext={() => setStep(slot ? "form" : "pick")} />;
  }

  if (step === "pick" || !slot) {
    return (
      <div className={styles.stack}>
        <Intro intro={intro} compact onBack={() => setStep("intro")} />
        <h2 className={styles.stepTitle}>Pick a day and time</h2>
        <SlotPicker
          slots={slots}
          taken={taken}
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
      mode: values.mode || null,
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
    // The phone is checked on its own too (the schema only checks it once the rest is valid).
    if (values.phone.trim() && !formatPhone(values.phoneCountry, values.phone)) {
      found.phone ??= "Enter a valid phone number for the country you picked.";
    }
    for (const [k, m] of Object.entries(checkStandardFields(fields, values))) found[k] ??= m;
    const a = checkAnswers(questions, answers);
    if (!a.ok) found[`answers.${a.index}`] = a.message;
    return found;
  }

  return (
    <form
      className={styles.stack}
      noValidate
      aria-label="Your details"
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
            mode: values.mode || null,
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
      <Intro intro={intro} compact />
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
      {/* Email first: the confirmation and reminders go there (D-043). */}
      <div className={styles.grid2}>
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
          label="Your name"
          required
          autoComplete="name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        {fields.company.show && (
          <TextField
            label={fields.company.required ? "Company" : "Company (optional)"}
            required={fields.company.required}
            autoComplete="organization"
            value={values.company}
            onChange={set("company")}
            error={errors.company}
          />
        )}
        {fields.phone.show && (
          <PhoneField
            label={fields.phone.required ? "Phone" : "Phone (optional)"}
            required={fields.phone.required}
            country={values.phoneCountry}
            number={values.phone}
            onCountry={(c) => {
              setValues((v) => ({ ...v, phoneCountry: c }));
              clear("phone");
            }}
            onNumber={(n) => {
              setValues((v) => ({ ...v, phone: n }));
              clear("phone");
            }}
            error={errors.phone}
          />
        )}
      </div>
      {fields.linkedin.show && (
        <TextField
          label={fields.linkedin.required ? "LinkedIn profile" : "LinkedIn profile (optional)"}
          required={fields.linkedin.required}
          placeholder="https://www.linkedin.com/in/…"
          inputMode="url"
          value={values.linkedin}
          onChange={set("linkedin")}
          error={errors.linkedin}
        />
      )}
      {fields.mode.show && (
        <fieldset className={styles.choiceSet} aria-invalid={errors.mode ? true : undefined}>
          <legend className={fieldStyles.label}>
            How would you like to meet?
            {fields.mode.required && (
              <span className={fieldStyles.req} aria-hidden>
                {" "}
                *
              </span>
            )}
          </legend>
          <div className={styles.modeChoices}>
            {(["online", "in_person"] as const).map((m) => (
              <label key={m} className={styles.modeChoice}>
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={values.mode === m}
                  onChange={() => {
                    setValues((v) => ({ ...v, mode: m }));
                    clear("mode");
                  }}
                />
                <span>
                  <strong>{MODE_LABELS[m]}</strong>
                  <span className={styles.muted}>
                    {m === "online" ? online : (address ?? "We'll confirm the place with you")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errors.mode && (
            <p className={fieldStyles.error} role="alert">
              {errors.mode}
            </p>
          )}
        </fieldset>
      )}
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
