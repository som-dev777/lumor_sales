"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { WEEKDAYS, type TimeRange, type WeeklyHours } from "@/lib/slots";
import { minutesOf, nextRange } from "@/lib/slots";
import { formatIstDate } from "@/lib/time";
import { MAX_RANGES_PER_DAY, toSlug } from "@/lib/validation/calendar";
import { saveAvailabilityAction } from "@/server/actions/calendar";
import { TestEmailButton } from "./TestEmailButton";
import styles from "./calendar.module.scss";

const DAYS = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** Weekly hours (IST), days off and the booking page's link name (F22). */
export function AvailabilityForm({
  initial,
  baseUrl,
  today,
  loginEmail,
  meetingTypes,
  emailSetup,
}: {
  /** How emails go out, in words (D-047). */
  emailSetup: string;
  initial: {
    slug: string;
    weeklyHours: WeeklyHours;
    daysOff: string[];
    notifyEmail: string | null;
    emailTitle: string | null;
    useGoogleBusy: boolean;
  };
  baseUrl: string;
  today: string;
  loginEmail: string;
  /** Active meeting types, to warn when one fits in none of a day's ranges. */
  meetingTypes: { name: string; durationMin: number }[];
}) {
  const notify = useToast();
  const [hours, setHours] = useState<WeeklyHours>(initial.weeklyHours);
  const [daysOff, setDaysOff] = useState<string[]>(initial.daysOff);
  const [slug, setSlug] = useState(initial.slug);
  const [notifyEmail, setNotifyEmail] = useState(initial.notifyEmail ?? "");
  const [emailTitle, setEmailTitle] = useState(initial.emailTitle ?? "");
  const [useGoogleBusy, setUseGoogleBusy] = useState(initial.useGoogleBusy);
  const [newDay, setNewDay] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const setRange = (day: string, i: number, part: keyof TimeRange, value: string) =>
    setHours((h) => ({
      ...h,
      [day]: (h[day] ?? []).map((r, j) => (j === i ? { ...r, [part]: value } : r)),
    }));
  const addRange = (day: string) =>
    setHours((h) => {
      const list = h[day] ?? [];
      const next = rangeAfter(list);
      return next ? { ...h, [day]: [...list, next] } : h;
    });
  const removeRange = (day: string, i: number) =>
    setHours((h) => ({ ...h, [day]: (h[day] ?? []).filter((_, j) => j !== i) }));

  const save = () =>
    start(async () => {
      setError(null);
      setErrors({});
      const weeklyHours = Object.fromEntries(DAYS.map((d) => [d, hours[d] ?? []]));
      const r = await saveAvailabilityAction({
        slug,
        weeklyHours,
        daysOff,
        notifyEmail,
        emailTitle,
        useGoogleBusy,
      });
      if (r.ok) notify("success", r.message ?? "Saved.");
      else {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
      }
    });

  return (
    <div className={styles.stack}>
      {error && <Alert tone="error">{error}</Alert>}
      <section className={styles.card} aria-label="Weekly hours">
        <h2 className={styles.cardTitle}>Weekly hours (India time)</h2>
        <p className={styles.muted}>
          People can book inside these hours, and changes reach your booking links at once. Add as
          many ranges as you like, e.g. 10:00–13:00 and 14:00–18:00, or exact slots like 11:00–11:30
          and 12:00–12:30. A meeting must fit inside one range.
        </p>
        {errors.weeklyHours && <Alert tone="error">{errors.weeklyHours}</Alert>}
        <div>
          {DAYS.map((d, n) => {
            const list = hours[d] ?? [];
            const longest = Math.max(
              0,
              ...list.map((r) => (minutesOf(r.end) ?? 0) - (minutesOf(r.start) ?? 0)),
            );
            const tooLong = list.length ? meetingTypes.filter((t) => t.durationMin > longest) : [];
            return (
              <div key={d} className={styles.dayRow}>
                <div className={styles.dayName}>{WEEKDAYS[n]}</div>
                <div className={styles.ranges}>
                  {list.length === 0 && <p className={styles.muted}>Not available</p>}
                  {list.map((r, i) => (
                    <div key={i} className={styles.range}>
                      <input
                        type="time"
                        step={900}
                        className={styles.timeInput}
                        aria-label={`${WEEKDAYS[n]} from`}
                        value={r.start}
                        onChange={(e) => setRange(d, i, "start", e.target.value)}
                      />
                      <span aria-hidden>–</span>
                      <input
                        type="time"
                        step={900}
                        className={styles.timeInput}
                        aria-label={`${WEEKDAYS[n]} until`}
                        value={r.end}
                        onChange={(e) => setRange(d, i, "end", e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        aria-label={`Remove ${WEEKDAYS[n]} ${r.start}–${r.end}`}
                        onClick={() => removeRange(d, i)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </Button>
                    </div>
                  ))}
                  {tooLong.length > 0 && (
                    <p className={styles.warnText} role="note">
                      No times that day for{" "}
                      {tooLong.map((t) => `${t.name} (${t.durationMin} min)`).join(", ")}:
                      it&rsquo;s longer than every range.
                    </p>
                  )}
                  {list.length < MAX_RANGES_PER_DAY && rangeAfter(list) && (
                    <div>
                      <Button
                        variant="ghost"
                        aria-label={`Add hours on ${WEEKDAYS[n]}`}
                        onClick={() => addRange(d)}
                      >
                        <Plus size={16} aria-hidden /> Add hours
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.card} aria-label="Days off">
        <h2 className={styles.cardTitle}>Days off</h2>
        <p className={styles.muted}>No bookings on these dates (holidays, leave).</p>
        <div className={styles.range}>
          <TextField
            label="Add a day off"
            type="date"
            min={today}
            value={newDay}
            onChange={(e) => setNewDay(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!newDay}
            onClick={() => {
              setDaysOff((d) => [...new Set([...d, newDay])].sort());
              setNewDay("");
            }}
          >
            Add
          </Button>
        </div>
        {daysOff.length > 0 && (
          <div className={styles.chips}>
            {daysOff.map((d) => (
              <span key={d} className={styles.chip}>
                {formatIstDate(d, "EEE d MMM yyyy")}
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Remove day off ${formatIstDate(d)}`}
                  onClick={() => setDaysOff((all) => all.filter((x) => x !== d))}
                >
                  <X size={14} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card} aria-label="Booking emails">
        <h2 className={styles.cardTitle}>Booking emails</h2>
        <TextField
          label="Send booking emails to"
          type="email"
          placeholder={loginEmail}
          value={notifyEmail}
          error={errors.notifyEmail}
          hint={`New bookings, cancellations, reschedules and teammate changes. Empty = ${loginEmail}.`}
          onChange={(e) => setNotifyEmail(e.target.value)}
        />
        <TextField
          label="Your title in emails"
          placeholder="e.g. Co-founder, Lumor"
          value={emailTitle}
          maxLength={120}
          error={errors.emailTitle}
          hint="Shown after your name in the confirmation people get: “With: Your Name, Co-founder, Lumor”."
          onChange={(e) => setEmailTitle(e.target.value)}
        />
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={useGoogleBusy}
            onChange={(e) => setUseGoogleBusy(e.target.checked)}
          />{" "}
          Hide times that are busy in my Google Calendar (off: people can book them, and you decide
          afterwards)
        </label>
        <TestEmailButton setup={emailSetup} />
      </section>

      <section className={styles.card} aria-label="Booking page">
        <h2 className={styles.cardTitle}>Your booking page</h2>
        <TextField
          label="Link name"
          value={slug}
          error={errors.slug}
          hint={`${baseUrl}/book/${slug || "…"}`}
          onChange={(e) => setSlug(e.target.value)}
          onBlur={() => setSlug(toSlug(slug, ""))}
        />
        <p className={styles.muted}>
          Changing it changes every booking link you&rsquo;ve shared, so the old links stop working.
        </p>
      </section>

      <div className={styles.formActions}>
        <Button onClick={save} loading={busy}>
          Save availability
        </Button>
      </div>
    </div>
  );
}

/** The range "Add hours" adds: after the day's latest range (10:00–18:00 on an empty day). */
function rangeAfter(list: TimeRange[]): TimeRange | null {
  if (list.length === 0) return { start: "10:00", end: "18:00" };
  const latest = [...list].sort((a, b) => a.end.localeCompare(b.end)).at(-1)!;
  return nextRange(latest);
}
