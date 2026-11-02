"use client";

import { CalendarPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { scheduleMeetingAction } from "@/server/actions/calendar";
import styles from "./calendar.module.scss";

const HOW = [
  { value: "meet", label: "Google Meet (link made for you)" },
  { value: "in_person", label: "In person" },
  { value: "phone", label: "Phone call" },
  { value: "link", label: "Another meeting link (Zoom, Teams…)" },
] as const;

const PLACE_LABEL: Record<string, string> = {
  in_person: "Address",
  phone: "Phone number to call",
  link: "Meeting link",
};

const LENGTHS = [15, 20, 30, 45, 60, 90, 120];

const EMPTY = {
  title: "",
  date: "",
  time: "",
  durationMin: "30",
  how: "meet",
  place: "",
  to: "",
  cc: "",
  message: "",
};

/** A rep schedules a meeting themselves, emailed to To with CC copied (D-043). */
export function ScheduleMeetingDialog() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => {
    setV((x) => ({ ...x, [k]: e.target.value }));
    setErrors((all) => {
      if (!(k in all)) return all;
      const next = { ...all };
      delete next[k];
      return next;
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await scheduleMeetingAction(v);
      if (!r.ok) {
        setError(r.error);
        setErrors(r.fieldErrors ?? {});
        return;
      }
      notify("success", r.message ?? "Scheduled.");
      setV(EMPTY);
      setErrors({});
      setOpen(false);
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus size={16} aria-hidden /> Schedule a meeting
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title="Schedule a meeting"
        description="It goes on your calendar and the invitation is emailed to the To addresses, with CC copied. Times are India time (IST)."
      >
        <form className={styles.stack} onSubmit={submit} noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Title"
            required
            placeholder="e.g. Lumor walkthrough with Acme"
            value={v.title}
            onChange={set("title")}
            error={errors.title}
          />
          <div className={styles.grid3}>
            <TextField
              label="Date"
              type="date"
              required
              value={v.date}
              onChange={set("date")}
              error={errors.date}
            />
            <TextField
              label="Start time (IST)"
              type="time"
              required
              step={300}
              value={v.time}
              onChange={set("time")}
              error={errors.time}
            />
            <SelectField
              label="Length"
              value={v.durationMin}
              onChange={set("durationMin")}
              options={LENGTHS.map((m) => ({ value: String(m), label: `${m} minutes` }))}
              error={errors.durationMin}
            />
          </div>
          <div className={styles.grid2}>
            <SelectField
              label="How to meet"
              value={v.how}
              onChange={set("how")}
              options={HOW.map((h) => ({ value: h.value, label: h.label }))}
            />
            {v.how !== "meet" && (
              <TextField
                label={PLACE_LABEL[v.how]}
                required
                value={v.place}
                onChange={set("place")}
                error={errors.place}
              />
            )}
          </div>
          <TextField
            label="To"
            required
            placeholder="name@company.com, another@company.com"
            hint="Separate addresses with commas. The first one is linked to the person in the Sales Hub, if they're there."
            inputMode="email"
            value={v.to}
            onChange={set("to")}
            error={errors.to}
          />
          <TextField
            label="CC (optional)"
            placeholder="colleague@lumor.tech"
            inputMode="email"
            value={v.cc}
            onChange={set("cc")}
            error={errors.cc}
          />
          <TextArea
            label="Message (optional)"
            rows={3}
            maxLength={2000}
            placeholder="A line about what you'll cover."
            value={v.message}
            onChange={set("message")}
            error={errors.message}
          />
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Schedule and send
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
