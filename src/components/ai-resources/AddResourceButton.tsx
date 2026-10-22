"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { RESOURCE_CATEGORIES } from "@/lib/db/enums";
import { checkUpload } from "@/lib/validation/ai-resources";
import { addResourceFile, addResourceLink } from "@/server/actions/ai-resources";
import styles from "./ai-resources.module.scss";

/** Admin only: add a sales resource, as a file (5 MB at most) or a link (F20). */
export function AddResourceButton() {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"file" | "link">("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const reset = () => {
    setTitle("");
    setDescription("");
    setCategory("");
    setUrl("");
    setFile(null);
    setError(null);
  };

  const save = () =>
    start(async () => {
      let r;
      if (kind === "file") {
        if (!file) return setError("Choose a file to upload.");
        const check = checkUpload(file.name, file.size);
        if (!check.ok) return setError(check.error);
        const form = new FormData();
        form.set("title", title);
        form.set("description", description);
        form.set("category", category);
        form.set("file", file);
        r = await addResourceFile(form);
      } else {
        r = await addResourceLink({ title, description, category, url });
      }
      if (!r.ok) return setError(Object.values(r.fieldErrors ?? {})[0] ?? r.error);
      notify("success", r.message ?? "Added.");
      reset();
      setOpen(false);
    });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={16} aria-hidden /> Add resource
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title="Add a sales resource">
        <div className={styles.form}>
          {error && <Alert tone="error">{error}</Alert>}
          <div className={styles.toggle} role="radiogroup" aria-label="File or link">
            {(["file", "link"] as const).map((k) => (
              <label key={k} className={styles.check}>
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                {k === "file" ? "Upload a file" : "Add a link"}
              </label>
            ))}
          </div>
          <TextField
            label="Title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
          <SelectField
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: "", label: "Choose…" },
              ...RESOURCE_CATEGORIES.map((c) => ({ value: c, label: c })),
            ]}
          />
          <TextArea
            label="Description (optional)"
            rows={2}
            value={description}
            maxLength={500}
            onChange={(e) => setDescription(e.target.value)}
          />
          {kind === "file" ? (
            <label className={styles.fileField}>
              <span>File (PDF, JPG, PNG, MD or MP4, up to 5 MB)</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.md,.mp4"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <span className={styles.muted}>
                For videos and big decks, use &ldquo;Add a link&rdquo; (Google Drive, Loom,
                YouTube).
              </span>
            </label>
          ) : (
            <TextField
              label="Link"
              type="url"
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              {kind === "file" ? "Upload" : "Add link"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
