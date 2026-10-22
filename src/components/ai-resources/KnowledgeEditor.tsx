"use client";

import { FileUp, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { AI_PROMPT_IDS, type AiPromptId } from "@/lib/db/enums";
import { saveKnowledge } from "@/server/actions/ai-resources";
import { PROMPT_LABEL } from "./labels";
import styles from "./ai-resources.module.scss";

type Value = {
  title: string;
  content: string;
  loadFor: AiPromptId[];
  placeLast: boolean;
  active: boolean;
};

const EMPTY: Value = {
  title: "",
  content: "",
  loadFor: [...AI_PROMPT_IDS],
  placeLast: false,
  active: true,
};

/** Admin only: add or edit a knowledge file (F20). The server checks the role again. */
export function KnowledgeEditor({ fileId, initial }: { fileId?: string; initial?: Value }) {
  const router = useRouter();
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<Value>(initial ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const upload = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      setError("Upload a Markdown (.md) file.");
      return;
    }
    const text = await file.text();
    const heading = text.match(/^#\s+(.+)$/m)?.[1].trim();
    setValue((v) => ({
      ...v,
      content: text,
      title: v.title || heading || file.name.replace(/\.md$/i, ""),
    }));
    setError(null);
  };

  const save = () =>
    start(async () => {
      const r = await saveKnowledge(fileId ?? null, value);
      if (!r.ok) {
        setError(Object.values(r.fieldErrors ?? {})[0] ?? r.error);
        return;
      }
      notify("success", r.message ?? "Saved.");
      setOpen(false);
      if (!fileId && r.link) router.push(r.link);
    });

  return (
    <>
      <Button variant={fileId ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {fileId ? <Pencil size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
        {fileId ? "Edit" : "Add knowledge file"}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={fileId ? "Edit knowledge file" : "Add a knowledge file"}
      >
        <div className={styles.form}>
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Title"
            value={value.title}
            maxLength={120}
            onChange={(e) => setValue({ ...value, title: e.target.value })}
          />
          <div className={styles.row}>
            <input
              ref={upload}
              type="file"
              accept=".md,text/markdown"
              className={styles.hiddenInput}
              aria-label="Upload a Markdown file"
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
            <Button variant="secondary" onClick={() => upload.current?.click()}>
              <FileUp size={16} aria-hidden />{" "}
              {fileId ? "Replace with a .md file" : "Upload a .md file"}
            </Button>
            <span className={styles.muted}>or paste or edit the text below.</span>
          </div>
          <TextArea
            label="Text (Markdown)"
            rows={14}
            value={value.content}
            maxLength={200000}
            onChange={(e) => setValue({ ...value, content: e.target.value })}
          />
          <fieldset className={styles.fieldset}>
            <legend>Which AI features read this file</legend>
            {AI_PROMPT_IDS.map((p) => (
              <label key={p} className={styles.check}>
                <input
                  type="checkbox"
                  checked={value.loadFor.includes(p)}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      loadFor: e.target.checked
                        ? [...value.loadFor, p]
                        : value.loadFor.filter((x) => x !== p),
                    })
                  }
                />
                {PROMPT_LABEL[p]}
              </label>
            ))}
          </fieldset>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value.placeLast}
              onChange={(e) => setValue({ ...value, placeLast: e.target.checked })}
            />
            Place last (its rules win, like the guardrails file)
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={value.active}
              onChange={(e) => setValue({ ...value, active: e.target.checked })}
            />
            Active (the AI reads it)
          </label>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
