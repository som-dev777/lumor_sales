// Add many (F30, D-065): up to 50 people pasted from a Sales Navigator list or a CSV. Each line is
// added exactly like Add person (createPersonTx: the permission check, the duplicate check, the
// company matched or created, and the audit entry, in its own transaction). Lines that can't be
// added are listed with why.
import { ZodError } from "zod";
import type { Db } from "@/lib/db/client";
import { normaliseLinkedInUrl } from "@/lib/linkedin";
import { assertCan, PermissionError, type Actor } from "@/lib/permissions";
import { personSchema } from "@/lib/validation/leads";
import { LeadError } from "./companies";
import { createPersonTx } from "./people";

export const BULK_MAX = 50;

export type BulkLine = {
  line: number;
  link: string;
  name: string | null;
  title: string | null;
  company: string | null;
};

export type BulkDefaults = {
  companyName?: string | null;
  personaId?: string | null;
  accountFilterId?: string | null;
};

export type BulkResult = {
  added: { id: string; name: string }[];
  skipped: { line: number; text: string; reason: string }[];
};

/** Splits one line on tabs, `|` or commas (commas inside "quotes" are kept). */
function cells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (line.includes("|")) return line.split("|").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const isLink = (c: string) => /linkedin\.com\//i.test(c);

/** Which column is which, from a CSV header row (null when the first line isn't a header). */
function headerMap(row: string[]) {
  if (row.some(isLink)) return null;
  const find = (...words: string[]) =>
    row.findIndex((c) => words.some((w) => c.toLowerCase().includes(w)));
  const link = find("link", "profile", "url", "linkedin");
  if (link < 0) return null;
  return {
    link,
    name: find("name"),
    title: find("title", "role", "position"),
    company: find("company", "account", "organisation", "organization"),
  };
}

/**
 * The pasted text (or a CSV with a header row) as lines. Without a header: the link is the cell
 * that looks like a LinkedIn link, then name, title and company in that order.
 */
export function parseBulk(text: string): BulkLine[] {
  const raw = text.split(/\r?\n/).map((l, i) => ({ l: l.trim(), n: i + 1 }));
  const lines = raw.filter((x) => x.l);
  if (lines.length === 0) return [];
  const head = headerMap(cells(lines[0].l));
  const body = head ? lines.slice(1) : lines;
  const val = (c: string[], i: number) => (i >= 0 && c[i] ? c[i] : null);
  return body.map(({ l, n }) => {
    const c = cells(l);
    if (head) {
      return {
        line: n,
        link: c[head.link] ?? "",
        name: val(c, head.name),
        title: val(c, head.title),
        company: val(c, head.company),
      };
    }
    const at = c.findIndex(isLink);
    const rest = c.filter((_, i) => i !== (at < 0 ? 0 : at));
    return {
      line: n,
      link: c[at < 0 ? 0 : at] ?? "",
      name: rest[0] || null,
      title: rest[1] || null,
      company: rest[2] || null,
    };
  });
}

/** "linkedin.com/in/priya-sharma-1a2b3c" → "Priya Sharma" (null when it can't tell). */
export function nameFromLink(link: string): string | null {
  const r = normaliseLinkedInUrl(link);
  if (!r.ok) return null;
  const slug = r.normalised.split("/in/")[1] ?? "";
  const words = slug
    .split(/[-_]+/)
    .filter((w) => w && !/\d/.test(w))
    .map((w) => w[0].toUpperCase() + w.slice(1));
  return words.length >= 1 && words.join(" ").length >= 2 ? words.join(" ") : null;
}

function reasonOf(e: unknown): string {
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Check this line.";
  if (e instanceof LeadError || e instanceof PermissionError) return e.message;
  throw e;
}

export async function addMany(
  db: Db,
  actor: Actor,
  text: string,
  defaults: BulkDefaults = {},
): Promise<BulkResult> {
  assertCan(actor, "lead.create");
  const lines = parseBulk(text);
  if (lines.length === 0) throw new LeadError("Paste at least one LinkedIn profile link.");
  if (lines.length > BULK_MAX) {
    throw new LeadError(`Up to ${BULK_MAX} people at a time. This has ${lines.length}.`);
  }
  const result: BulkResult = { added: [], skipped: [] };
  for (const l of lines) {
    const shown = [l.link, l.name, l.company].filter(Boolean).join(", ");
    const skip = (reason: string) => result.skipped.push({ line: l.line, text: shown, reason });
    if (/linkedin\.com\/sales\//i.test(l.link)) {
      skip(
        "That's a Sales Navigator link. In Sales Navigator, open ⋯ → Copy LinkedIn.com URL and paste that.",
      );
      continue;
    }
    if (!isLink(l.link)) {
      skip("No LinkedIn link on this line.");
      continue;
    }
    const name = l.name || nameFromLink(l.link);
    if (!name) {
      skip("Add the person's name after the link.");
      continue;
    }
    const companyName = l.company || defaults.companyName?.trim() || null;
    if (!companyName) {
      skip("No company: add it after the title, or choose a company for all lines.");
      continue;
    }
    try {
      const data = personSchema.parse({
        fullName: name,
        title: l.title,
        linkedinUrl: l.link,
        companyName,
        personaId: defaults.personaId || null,
        accountFilterId: defaults.accountFilterId || null,
        stage: "Prospect",
      });
      const row = await db.transaction((tx) =>
        createPersonTx(tx, actor, data, { addedBy: "Add many" }),
      );
      result.added.push({ id: row.id, name: row.fullName });
    } catch (e) {
      skip(reasonOf(e));
    }
  }
  return result;
}
