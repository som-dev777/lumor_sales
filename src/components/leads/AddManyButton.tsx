"use client";

// Add many (F30): paste up to 50 people from a Sales Navigator list, or pick a CSV. Each line is
// added like Add person; the ones that can't be are listed with why.
import { Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextArea } from "@/components/ui/TextArea";
import { TextField } from "@/components/ui/TextField";
import { addManyPeople } from "@/server/actions/sprint";
import type { BulkResult } from "@/server/leads/bulk-add";
import type { LeadFormOptions } from "@/server/leads/options";
import styles from "./bulk.module.scss";

const EXAMPLE =
  "linkedin.com/in/priya-sharma, Priya Sharma, Head of Research, Acme Insights\nlinkedin.com/in/rahul-mehta";

export function AddManyButton({ options }: { options: LeadFormOptions }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [accountFilterId, setAccountFilterId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [pending, start] = useTransition();

  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const reset = () => {
    setText("");
    setError(null);
    setResult(null);
  };

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100_000) {
      setError("That file is too big. Use up to 50 rows.");
      return;
    }
    setText(await file.text());
    setError(null);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await addManyPeople({ text, companyName, personaId, accountFilterId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult(r.data ?? null);
      setText("");
    });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Users size={16} aria-hidden />
        Add many
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
        size="lg"
        title="Add many people"
        description="Up to 50 at a time, from a Sales Navigator list or a spreadsheet."
      >
        <div className={styles.body}>
          {result && (
            <Alert tone={result.added.length ? "success" : "warning"}>
              Added {result.added.length} {result.added.length === 1 ? "person" : "people"}.
              {result.skipped.length > 0 && ` ${result.skipped.length} not added (below).`}
            </Alert>
          )}
          {result && result.skipped.length > 0 && (
            <ul className={styles.skipped} aria-label="Not added">
              {result.skipped.map((s) => (
                <li key={s.line}>
                  <strong>Line {s.line}</strong> ({s.text}): {s.reason}
                </li>
              ))}
            </ul>
          )}
          {result && result.added.length > 0 && (
            <p className={styles.next}>
              Next: <Link href="/sprint">start a connection sprint</Link> to send them requests.
            </p>
          )}
          <TextArea
            label="People, one per line"
            hint={`Profile link, then name, title and company (commas, tabs or |). Only the link is needed when you choose a company below. ${lines ? `${lines} line${lines === 1 ? "" : "s"}.` : ""}`}
            rows={8}
            value={text}
            placeholder={EXAMPLE}
            onChange={(e) => setText(e.target.value)}
          />
          <label className={styles.file}>
            Or pick a CSV file (with a header row: link, name, title, company)
            <input type="file" accept=".csv,text/csv,text/plain" onChange={pickFile} />
          </label>
          <div className={styles.grid}>
            <TextField
              label="Company for lines without one"
              value={companyName}
              list="add-many-companies"
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <datalist id="add-many-companies">
              {options.companies.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <SelectField
              label="Persona for all"
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              options={[
                { value: "", label: "None" },
                ...options.personas.map((p) => ({ value: p.id, label: p.label })),
              ]}
            />
            <SelectField
              label="Account filter for all"
              value={accountFilterId}
              onChange={(e) => setAccountFilterId(e.target.value)}
              options={[
                { value: "", label: "None" },
                ...options.accountFilters.map((p) => ({ value: p.id, label: p.label })),
              ]}
            />
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={submit} loading={pending} disabled={!lines}>
              Add {lines || ""} {lines === 1 ? "person" : "people"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
