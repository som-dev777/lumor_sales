// Fill with AI (F24, P08 and P09): the AI searches the web from what the rep typed and suggests
// values for the fields left empty on the company or person form. Nothing is saved here; the
// form shows the values and the rep checks them before saving.
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/lib/db/client";
import { HEADCOUNT_BANDS, LEVELS, SENIORITIES } from "@/lib/db/enums";
import { accountFilter, persona } from "@/lib/db/schema";
import { assertCan, type Actor } from "@/lib/permissions";
import { todayIst } from "@/lib/time";
import { industryNames } from "../industries";
import { LeadError } from "../leads/companies";
import { runSearchPrompt } from "./client";

const CONFIDENCE = ["high", "medium", "low"] as const;

const common = {
  accountFilterCode: z.string().nullable(),
  notes: z.string().nullable(),
  confidence: z.enum(CONFIDENCE),
  sources: z.array(z.string()),
  checks: z.array(z.string()),
};

export const companyFillSchema = z.object({
  website: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  industry: z.string().nullable(),
  headcountBand: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  ...common,
});

export const personFillSchema = z.object({
  title: z.string().nullable(),
  personaName: z.string().nullable(),
  level: z.enum(LEVELS).nullable(),
  seniority: z.enum(SENIORITIES).nullable(),
  market: z.string().nullable(),
  ...common,
});

/** What the form has so far (all text; empty means "not filled"). */
const formText = z.record(z.string(), z.union([z.string().max(5000), z.boolean(), z.null()]));
export type FormSoFar = z.infer<typeof formText>;

export type FillResult = {
  /** Only the fields that were empty, with the value to put in. */
  values: Record<string, string>;
  confidence: (typeof CONFIDENCE)[number];
  sources: string[];
  checks: string[];
  /** False when the model couldn't search, so it answered from what it knows. */
  searched: boolean;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const clean = (v: string | null, max: number) => (v ? v.trim().slice(0, max) : "");
const isLink = (v: string) => /^https?:\/\/\S+\.\S+/i.test(v);

async function activeFilters(db: DbOrTx) {
  return db
    .select({
      id: accountFilter.id,
      code: accountFilter.code,
      name: accountFilter.name,
      headcount: accountFilter.companyHeadcount,
      keyFilters: accountFilter.keyFilters,
      keywords: accountFilter.keywords,
    })
    .from(accountFilter)
    .where(eq(accountFilter.status, "Active"))
    .orderBy(asc(accountFilter.code));
}

/** Keeps only the fields the form left empty; notes are added below the rep's notes. */
function onlyEmpty(form: FormSoFar, suggested: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const [field, value] of Object.entries(suggested)) {
    if (!value) continue;
    if (field === "notes") {
      const before = text(form.notes);
      if (!before.includes(value)) values.notes = before ? `${before}\n\n${value}` : value;
    } else if (!text(form[field])) {
      values[field] = value;
    }
  }
  return values;
}

const tidy = (list: string[], max: number) =>
  list
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);

/** P08: suggests the empty company fields from the web. */
export async function fillCompany(
  db: DbOrTx,
  actor: Actor,
  input: unknown,
  now = new Date(),
): Promise<FillResult> {
  assertCan(actor, "lead.create");
  const form = formText.parse(input);
  const name = text(form.name);
  if (name.length < 2) throw new LeadError("Type the company name first.");
  const [industries, filters] = await Promise.all([industryNames(db), activeFilters(db)]);

  const { data, searched } = await runSearchPrompt(
    "P08",
    companyFillSchema,
    {
      COMPANY: {
        name,
        website: text(form.website) || null,
        linkedinPage: text(form.linkedinUrl) || null,
        city: text(form.city) || null,
        notes: text(form.notes) || null,
      },
      INDUSTRIES: industries,
      "ACCOUNT FILTERS": filters.map(({ id: _id, ...f }) => f),
      "HEADCOUNT BANDS": HEADCOUNT_BANDS,
      TODAY: todayIst(now),
    },
    () => fakeCompany(name, industries, filters[0]?.code ?? null),
  );
  const result = { confidence: data.confidence, searched };
  const sources = tidy(data.sources, 3).filter(isLink);
  const checks = tidy(data.checks, 5);
  if (data.confidence === "low") return { values: {}, sources, checks, ...result };

  const industry = clean(data.industry, 100);
  const band = clean(data.headcountBand, 50);
  const filter = filters.find(
    (f) => data.accountFilterCode && same(f.code, data.accountFilterCode),
  );
  const suggested: Record<string, string> = {
    website: isLink(clean(data.website, 500)) ? clean(data.website, 500) : "",
    linkedinUrl: isLink(clean(data.linkedinUrl, 500)) ? clean(data.linkedinUrl, 500) : "",
    // A listed industry is written exactly as listed; otherwise the AI's new name.
    industry: industries.find((i) => same(i, industry)) ?? industry,
    headcountBand: HEADCOUNT_BANDS.find((b) => same(b, band)) ?? band,
    city: clean(data.city, 100),
    country: clean(data.country, 100),
    accountFilterId: filter?.id ?? "",
    notes: clean(data.notes, 1000),
  };
  return { values: onlyEmpty(form, suggested), sources, checks, ...result };
}

// --- P10 Ask about a company (D-054) ---------------------------------------------------------

export const companyAnswerSchema = z.object({
  answer: z.string(),
  sources: z.array(z.string()),
});

/** One earlier question and answer in the company chat (kept only in the browser). */
const chatTurn = z.object({
  question: z.string().max(1000),
  answer: z.string().max(4000),
});

export const companyQuestionSchema = z.object({
  company: formText,
  chat: z.array(chatTurn).max(10),
  question: z
    .string()
    .trim()
    .min(1, "Type a question first.")
    .max(1000, "That question is too long."),
});

export type CompanyAnswer = { answer: string; sources: string[]; searched: boolean };

/** P10: answers the rep's question about the company on the form, from the web. Nothing saved. */
export async function askAboutCompany(
  db: DbOrTx,
  actor: Actor,
  input: unknown,
  now = new Date(),
): Promise<CompanyAnswer> {
  assertCan(actor, "lead.create");
  const parsed = companyQuestionSchema.safeParse(input);
  if (!parsed.success) throw new LeadError(parsed.error.issues[0].message);
  const { company, chat, question } = parsed.data;
  const name = text(company.name);
  if (name.length < 2) throw new LeadError("Type the company name first.");
  const { data, searched } = await runSearchPrompt(
    "P10",
    companyAnswerSchema,
    {
      COMPANY: {
        name,
        website: text(company.website) || null,
        linkedinPage: text(company.linkedinUrl) || null,
        industry: text(company.industry) || null,
        headcountBand: text(company.headcountBand) || null,
        city: text(company.city) || null,
        country: text(company.country) || null,
        notes: text(company.notes) || null,
      },
      CHAT: chat,
      QUESTION: question,
      TODAY: todayIst(now),
    },
    () => ({
      answer: `${name} runs consumer research panels. (A stand-in answer to: ${question})`,
      sources: [`https://www.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`],
    }),
  );
  const answer = data.answer.trim().slice(0, 4000);
  if (!answer) throw new LeadError("The AI had no answer to that. Try asking another way.");
  return { answer, sources: tidy(data.sources, 3).filter(isLink), searched };
}

/** P09: suggests the empty person fields from the web. */
export async function fillPerson(
  db: DbOrTx,
  actor: Actor,
  input: unknown,
  now = new Date(),
): Promise<FillResult> {
  assertCan(actor, "lead.create");
  const form = formText.parse(input);
  const fullName = text(form.fullName);
  if (fullName.length < 2 || (!text(form.companyName) && !text(form.linkedinUrl))) {
    throw new LeadError("Type the full name and the company (or LinkedIn link) first.");
  }
  const [personas, filters] = await Promise.all([
    db
      .select({
        id: persona.id,
        name: persona.name,
        tier: persona.tier,
        whoItCovers: persona.whoItCovers,
      })
      .from(persona)
      .where(eq(persona.status, "Active"))
      .orderBy(asc(persona.name)),
    activeFilters(db),
  ]);

  const { data, searched } = await runSearchPrompt(
    "P09",
    personFillSchema,
    {
      PERSON: {
        fullName,
        title: text(form.title) || null,
        linkedinProfile: text(form.linkedinUrl) || null,
        company: text(form.companyName) || null,
        email: text(form.email) || null,
        notes: text(form.notes) || null,
      },
      PERSONAS: personas.map(({ id: _id, ...p }) => p),
      "ACCOUNT FILTERS": filters.map(({ id: _id, ...f }) => f),
      LEVELS,
      SENIORITIES,
      TODAY: todayIst(now),
    },
    () => fakePerson(personas[0]?.name ?? null),
  );
  const result = { confidence: data.confidence, searched };
  const sources = tidy(data.sources, 3).filter(isLink);
  const checks = tidy(data.checks, 5);
  if (data.confidence === "low") return { values: {}, sources, checks, ...result };

  const match = personas.find((p) => data.personaName && same(p.name, data.personaName));
  const filter = filters.find(
    (f) => data.accountFilterCode && same(f.code, data.accountFilterCode),
  );
  const suggested: Record<string, string> = {
    title: clean(data.title, 200),
    personaId: match?.id ?? "",
    level: data.level ?? "",
    seniority: data.seniority ?? "",
    market: clean(data.market, 100),
    accountFilterId: filter?.id ?? "",
    notes: clean(data.notes, 1000),
  };
  return { values: onlyEmpty(form, suggested), sources, checks, ...result };
}

// The browser tests' stand-ins for the AI.
function fakeCompany(name: string, industries: string[], filterCode: string | null) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return companyFillSchema.parse({
    website: `https://www.${slug}.com`,
    linkedinUrl: `https://www.linkedin.com/company/${slug}`,
    industry: industries[0] ?? "Market Research",
    headcountBand: "51–200",
    city: "Bangalore",
    country: "India",
    accountFilterCode: filterCode,
    notes: `${name} runs consumer research panels. Headquarters: London, United Kingdom.`,
    // "Unknown" in the name stands for a company the AI can't pin down.
    confidence: /unknown/i.test(name) ? "low" : "high",
    sources: [`https://www.${slug}.com`],
    checks: [],
  });
}

function fakePerson(personaName: string | null) {
  return personFillSchema.parse({
    title: "Head of Research",
    personaName,
    level: "Leader",
    seniority: "Director",
    market: "India",
    accountFilterCode: null,
    notes: "Leads the research team.",
    confidence: "high",
    sources: [],
    checks: ["Check the title on their LinkedIn profile."],
  });
}
