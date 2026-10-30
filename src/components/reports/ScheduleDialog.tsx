"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { REPORT_FREQUENCIES } from "@/lib/db/enums";
import { saveSchedule } from "@/server/actions/reports";
import styles from "./reports.module.scss";

export type ScheduleValues = {
  name: string;
  frequency: string;
  timeOfDay: string;
  day: number | null;
  scope: string;
  personUserId: string | null;
  recipients: string;
  emails: string[];
  active: boolean;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  return `${h}:${i % 2 ? "30" : "00"}`;
});

const BLANK: ScheduleValues = {
  name: "",
  frequency: "Weekly",
  timeOfDay: "09:00",
  day: 1,
  scope: "team",
  personUserId: null,
  recipients: "admins",
  emails: [],
  active: true,
};

/** Admins: add or change a scheduled report (F19). The server checks the role again. */
export function ScheduleDialog({
  scheduleId = null,
  initial = BLANK,
  people,
}: {
  scheduleId?: string | null;
  initial?: ScheduleValues;
  people: { id: string; name: string }[];
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [emails, setEmails] = useState(initial.emails.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const set = (values: Partial<ScheduleValues>) => setV((x) => ({ ...x, ...values }));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveSchedule(scheduleId, { ...v, emails });
      if (!r.ok) return setError(r.error);
      notify("success", r.message ?? "Saved.");
      setOpen(false);
    });

  return (
    <>
      <Button
        variant={scheduleId ? "secondary" : "primary"}
        onClick={() => setOpen(true)}
        aria-label={scheduleId ? `Edit ${initial.name}` : undefined}
      >
        {scheduleId ? "Edit" : "Add schedule"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={scheduleId ? "Edit scheduled report" : "Add a scheduled report"}
      >
        <div className={styles.stack}>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Name"
            value={v.name}
            maxLength={80}
            onChange={(e) => set({ name: e.target.value })}
          />
          <div className={styles.form}>
            <SelectField
              label="Frequency"
              value={v.frequency}
              onChange={(e) => {
                const frequency = e.target.value;
                set({ frequency, day: frequency === "Daily" ? null : (v.day ?? 1) });
              }}
              options={REPORT_FREQUENCIES.map((f) => ({ value: f, label: f }))}
            />
            {v.frequency === "Weekly" && (
              <SelectField
                label="Day"
                value={String(v.day ?? 1)}
                onChange={(e) => set({ day: Number(e.target.value) })}
                options={WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }))}
              />
            )}
            {v.frequency !== "Daily" && v.frequency !== "Weekly" && (
              <SelectField
                label="Day of the month"
                value={String(v.day ?? 1)}
                onChange={(e) => set({ day: Number(e.target.value) })}
                options={Array.from({ length: 28 }, (_, i) => ({
                  value: String(i + 1),
                  label: String(i + 1),
                }))}
              />
            )}
            <SelectField
              label="Time (IST)"
              value={v.timeOfDay}
              onChange={(e) => set({ timeOfDay: e.target.value })}
              options={TIMES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className={styles.form}>
            <SelectField
              label="Report on"
              value={v.scope}
              onChange={(e) => {
                const scope = e.target.value;
                set({
                  scope,
                  recipients:
                    scope === "each-rep"
                      ? "each-rep"
                      : v.recipients === "each-rep"
                        ? "admins"
                        : v.recipients,
                });
              }}
              options={[
                { value: "team", label: "Whole team" },
                { value: "person", label: "One person" },
                { value: "each-rep", label: "Each rep gets their own" },
              ]}
            />
            {v.scope === "person" && (
              <SelectField
                label="Person"
                value={v.personUserId ?? ""}
                onChange={(e) => set({ personUserId: e.target.value || null })}
                options={[
                  { value: "", label: "Choose…" },
                  ...people.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
            <SelectField
              label="Send to"
              value={v.recipients}
              onChange={(e) => set({ recipients: e.target.value })}
              options={[
                { value: "admins", label: "Admins" },
                ...(v.scope === "each-rep"
                  ? [{ value: "each-rep", label: "Each rep (their own report)" }]
                  : [{ value: "emails", label: "These email addresses" }]),
              ]}
            />
          </div>
          {v.recipients === "emails" && (
            <TextArea
              label="Email addresses"
              hint="Separate them with commas."
              rows={2}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
            />
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={v.active}
              onChange={(e) => set({ active: e.target.checked })}
            />
            On
          </label>
          <div className={styles.actions}>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
