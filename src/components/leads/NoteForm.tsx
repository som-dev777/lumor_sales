"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { useToast } from "@/components/ui/Toast";
import { addPersonNote } from "@/server/actions/leads";
import styles from "./leads.module.scss";

/** Add a note to a lead (anyone can, even on someone else's lead). */
export function NoteForm({ personId }: { personId: string }) {
  const notify = useToast();
  const [text, setText] = useState("");
  const [busy, startTransition] = useTransition();
  return (
    <form
      className={styles.noteForm}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await addPersonNote(personId, text);
          notify(
            result.ok ? "success" : "error",
            result.ok ? (result.message ?? "Saved.") : result.error,
          );
          if (result.ok) setText("");
        });
      }}
    >
      <TextArea
        label="Add a note"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={5000}
      />
      <div>
        <Button type="submit" variant="secondary" loading={busy} disabled={!text.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}
