"use client";

import { Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { saveCompanyNotes } from "@/server/actions/leads";
import styles from "./leads.module.scss";

/** The company's notes, editable in place by its owner or an Admin (the server checks again). */
export function CompanyNotes({
  companyId,
  notes,
  canEdit,
}: {
  companyId: string;
  notes: string | null;
  canEdit: boolean;
}) {
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  if (!editing) {
    return (
      <>
        {notes ? (
          <p className={styles.eventBody}>{notes}</p>
        ) : (
          <p className={styles.muted}>No notes yet.</p>
        )}
        {canEdit && (
          <div className={styles.formActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setText(notes ?? "");
                setEditing(true);
              }}
            >
              <Pencil size={16} aria-hidden /> {notes ? "Edit notes" : "Add notes"}
            </Button>
          </div>
        )}
      </>
    );
  }
  return (
    <div className={styles.form}>
      {error && <Alert tone="error">{error}</Alert>}
      <TextArea
        label="Notes"
        rows={6}
        value={text}
        maxLength={5000}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.formActions}>
        <Button
          loading={busy}
          onClick={() =>
            start(async () => {
              const r = await saveCompanyNotes(companyId, text);
              if (!r.ok) return setError(r.error);
              notify("success", r.message ?? "Saved.");
              setError(null);
              setEditing(false);
            })
          }
        >
          Save notes
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
