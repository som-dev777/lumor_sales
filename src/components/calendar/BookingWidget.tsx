"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { bookSlot } from "@/server/actions/calendar";
import { formatDay, formatTime, SlotPicker, useTimeZone, zoneName } from "./SlotPicker";
import styles from "./calendar.module.scss";

type Question = { label: string; required: boolean };

/** The public booking page's picker and form (F22). No sign-in. */
export function BookingWidget({
  profileSlug,
  typeSlug,
  slots,
  questions,
}: {
  profileSlug: string;
  typeSlug: string;
  slots: string[];
  questions: Question[];
}) {
  const router = useRouter();
  const tz = useTimeZone();
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "form">("pick");
  const [values, setValues] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    linkedin: "",
    note: "",
    website: "",
  });
  const [answers, setAnswers] = useState<string[]>(questions.map(() => ""));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  if (step === "pick" || !slot) {
    return (
      <div className={styles.stack}>
        <SlotPicker
          slots={slots}
          value={slot}
          onChange={(iso) => {
            setSlot(iso);
            setStep("form");
            setError(null);
          }}
          zone={tz.zone}
          setZone={tz.setZone}
          zoneOptions={tz.options}
        />
      </div>
    );
  }

  const when = `${formatDay(new Date(slot), tz.zone, true)}, ${formatTime(new Date(slot), tz.zone)} (${zoneName(tz.zone)})`;

  return (
    <form
      className={styles.stack}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setErrors({});
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
      <div className={styles.row}>
        <Button variant="ghost" onClick={() => setStep("pick")} disabled={busy}>
          <ArrowLeft size={16} aria-hidden /> Change time
        </Button>
        <strong>{when}</strong>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className={styles.grid2}>
        <TextField
          label="Your name"
          autoComplete="name"
          value={values.name}
          onChange={set("name")}
          error={errors.name}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={set("email")}
          error={errors.email}
        />
        <TextField
          label="Company"
          autoComplete="organization"
          value={values.company}
          onChange={set("company")}
          error={errors.company}
        />
        <TextField
          label="Phone (optional)"
          type="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={set("phone")}
          error={errors.phone}
        />
      </div>
      <TextField
        label="LinkedIn profile (optional)"
        placeholder="https://www.linkedin.com/in/…"
        value={values.linkedin}
        onChange={set("linkedin")}
        error={errors.linkedin}
      />
      {questions.map((q, i) => (
        <TextField
          key={q.label}
          label={q.required ? q.label : `${q.label} (optional)`}
          value={answers[i]}
          onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))}
        />
      ))}
      <TextArea
        label="Anything you'd like to cover? (optional)"
        rows={3}
        value={values.note}
        onChange={set("note")}
        error={errors.note}
      />
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
        <Button type="submit" loading={busy}>
          Confirm booking
        </Button>
      </div>
    </form>
  );
}
