"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { REPORT_PRESETS } from "@/lib/report-periods";
import { generateReport } from "@/server/actions/reports";
import styles from "./reports.module.scss";

/** Make a report: who it's about (Admins can pick the team or anyone) and the period. */
export function ReportForm({ people }: { people: { id: string; name: string }[] | null }) {
  const notify = useToast();
  const router = useRouter();
  const [who, setWho] = useState("me");
  const [preset, setPreset] = useState("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const generate = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await generateReport({ who, preset, from, to });
      if (!r.ok) return setError(r.error);
      notify("success", r.message ?? "Report saved.");
      if (r.link) router.push(r.link);
    });
  };

  return (
    <form className={styles.stack} onSubmit={generate} aria-label="Make a report">
      <div className={styles.form}>
        <SelectField
          label="Who"
          value={who}
          onChange={(e) => setWho(e.target.value)}
          options={[
            { value: "me", label: "Me" },
            ...(people
              ? [
                  { value: "team", label: "Whole team" },
                  ...people.map((p) => ({ value: p.id, label: p.name })),
                ]
              : []),
          ]}
        />
        <SelectField
          label="Period"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          options={REPORT_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        />
        {preset === "custom" && (
          <>
            <TextField
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
        <div>
          <Button type="submit" loading={busy}>
            Generate
          </Button>
        </div>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </form>
  );
}
