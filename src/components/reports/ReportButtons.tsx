"use client";

import { Download, Mail, Printer, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { emailReportAction, writeReportSummary } from "@/server/actions/reports";
import { EmailFields } from "./EmailFields";
import styles from "./reports.module.scss";

/**
 * Download PDF (made by the app, with charts, D-043), Print, Download CSV, Email this report,
 * and Write AI summary.
 */
export function ReportButtons({
  id,
  canSummarise,
  teammates,
  hide = [],
  waiting = null,
}: {
  id: string;
  /** No summary yet, and AI is set up. */
  canSummarise: boolean;
  teammates: { id: string; name: string }[];
  /** Sections switched off on screen: the downloads leave them out too (D-059). */
  hide?: string[];
  /** Why downloads must wait (a switch saving, numbers being edited), or null. */
  waiting?: string | null;
}) {
  const notify = useToast();
  const [busy, start] = useTransition();
  const query = hide.length ? `?hide=${hide.join(",")}` : "";
  const download = (kind: "pdf" | "csv", label: string) =>
    waiting ? (
      <span className={`${styles.linkButton} ${styles.waiting}`} aria-disabled title={waiting}>
        <Download size={16} aria-hidden /> {label}
      </span>
    ) : (
      <a className={styles.linkButton} href={`/reports/${id}/${kind}${query}`}>
        <Download size={16} aria-hidden /> {label}
      </a>
    );
  return (
    <div className={`${styles.actions} ${styles.noPrint}`}>
      {download("pdf", "Download PDF")}
      <Button variant="secondary" onClick={() => window.print()}>
        <Printer size={16} aria-hidden /> Print
      </Button>
      <EmailReportButton id={id} teammates={teammates} waiting={waiting} />
      {download("csv", "Download CSV")}
      {waiting && <span className={styles.muted}>{waiting}</span>}
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

function EmailReportButton({
  id,
  teammates,
  waiting,
}: {
  id: string;
  teammates: { id: string; name: string }[];
  waiting: string | null;
}) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [shareWith, setShareWith] = useState<string[]>([]);
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        disabled={Boolean(waiting)}
        title={waiting ?? undefined}
      >
        <Mail size={16} aria-hidden /> Email this report
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Email this report">
        <div className={styles.stack}>
          {error && <Alert tone="error">{error}</Alert>}
          <EmailFields
            teammates={teammates}
            shareWith={shareWith}
            setShareWith={setShareWith}
            emails={emails}
            setEmails={setEmails}
          />
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await emailReportAction(id, { shareWith, emails });
                  if (!r.ok) return setError(r.error);
                  notify("success", r.message ?? "Sent.");
                  setOpen(false);
                  setShareWith([]);
                  setEmails("");
                })
              }
            >
              Send
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
