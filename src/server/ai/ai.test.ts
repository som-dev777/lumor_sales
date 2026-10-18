import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_NOT_SET_UP, aiMode, aiModel, DEFAULT_AI_MODEL, formatInput, runPrompt } from "./client";
import { editDistance, editLevel } from "./assist";
import { GUARDRAILS, PROMPTS } from "./prompts";
import { z } from "zod";

afterEach(() => vi.unstubAllEnvs());

describe("prompts are stored word for word (docs/ai-prompts.md)", () => {
  const doc = readFileSync("docs/ai-prompts.md", "utf8");
  for (const [id, p] of Object.entries(PROMPTS)) {
    it(`${id} v${p.version} matches the doc exactly and carries the guardrails`, () => {
      expect(doc).toContain(`## ${id}: ${p.name}`);
      expect(doc).toContain(`### Version ${p.version}`);
      expect(doc).toContain(p.system);
      expect(p.system).toContain(GUARDRAILS);
    });
  }
});

describe("edit level (PRD)", () => {
  it("None if unchanged, Light up to 20% changed, Heavy above", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editLevel("Hello there", "  Hello there ")).toBe("None");
    const base = "a".repeat(100);
    expect(editLevel(base, "b".repeat(20) + "a".repeat(80))).toBe("Light");
    expect(editLevel(base, "b".repeat(21) + "a".repeat(79))).toBe("Heavy");
  });
});

describe("AI client", () => {
  const schema = z.object({ ok: z.boolean() });

  it("without a key, says AI isn't set up (and never calls out)", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_FAKE", "");
    expect(aiMode()).toBe("off");
    await expect(runPrompt("P01", schema, {}, () => ({ ok: true }))).rejects.toThrow(AI_NOT_SET_UP);
  });

  it("the stand-in AI only works with a local database file", () => {
    vi.stubEnv("AI_FAKE", "1");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("DATABASE_URL", "libsql://prod.turso.io");
    expect(aiMode()).toBe("off");
    vi.stubEnv("DATABASE_URL", "file:.e2e/app.db");
    expect(aiMode()).toBe("fake");
  });

  it("uses gpt-5.5 unless OPENAI_MODEL names another model (D-036)", () => {
    vi.stubEnv("OPENAI_MODEL", "");
    expect(aiModel()).toBe(DEFAULT_AI_MODEL);
    expect(DEFAULT_AI_MODEL).toBe("gpt-5.5");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    expect(aiModel()).toBe("gpt-5.4-mini");
  });

  it("labels each part of the data", () => {
    expect(formatInput({ TODAY: "2026-10-17", PERSON: { name: "Priya" } })).toBe(
      'TODAY:\n2026-10-17\n\nPERSON:\n{\n  "name": "Priya"\n}',
    );
  });
});
