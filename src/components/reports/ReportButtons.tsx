"use client";

import { Download, Printer, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { writeReportSummary } from "@/server/actions/reports";
import styles from "./reports.module.scss";

/** Download PDF (the browser's Save as PDF, D-039), Download CSV, and Write AI summary. */
export function ReportButtons({
  id,
  canSummarise,
}: {
  id: string;
  /** No summary yet, and AI is set up. */
  canSummarise: boolean;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  return (
    <div className={`${styles.actions} ${styles.noPrint}`}>
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer size={16} aria-hidden /> Download PDF
      </Button>
      <a className={styles.linkButton} href={`/reports/${id}/csv`}>
        <Download size={16} aria-hidden /> Download CSV
      </a>
      {canSummarise && (
        <Button
          variant="secondary"
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await writeReportSummary(id);
              notify(r.ok ? "success" : "error", r.ok ? (r.message ?? "Done.") : r.error);
            })
          }
        >
          <Sparkles size={16} aria-hidden /> Write AI summary
        </Button>
      )}
      {busy && <span className={styles.muted}>Thinking… (up to 30 seconds)</span>}
    </div>
  );
}
