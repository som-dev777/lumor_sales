// Calling the AI for every AI feature (F08 Rank with AI, F18 Suggest next message and split conversation, F10 summary and
// draft). OpenAI since D-036. Server-side only: the API key never reaches the browser. Each
// call sends one prompt from prompts.ts plus labelled data, and gets back a JSON answer in a
// fixed shape (structured outputs), checked with Zod before use.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { PROMPTS, type PromptId } from "./prompts";

/** The default model; set OPENAI_MODEL in the environment to use another (D-036). */
export const DEFAULT_AI_MODEL = "gpt-5.5";
/** PRD: AI responses time out after 30 seconds, with a retry option on screen. */
export const AI_TIMEOUT_MS = 30_000;

export const AI_NOT_SET_UP =
  "AI isn't set up yet. An Admin needs to add OPENAI_API_KEY (see docs/deploy.md).";

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

export function aiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_AI_MODEL;
}

/**
 * "live" with an API key; "fake" for the automated browser tests (AI_FAKE=1, and only with a
 * local database file, so it can never switch on in production); otherwise "off".
 */
export function aiMode(): "live" | "fake" | "off" {
  if (process.env.AI_FAKE === "1" && (process.env.DATABASE_URL ?? "").startsWith("file:")) {
    return "fake";
  }
  return process.env.OPENAI_API_KEY?.trim() ? "live" : "off";
}

/** The data for a prompt, as labelled sections (e.g. "PRODUCT FACTS:" then JSON). */
export function formatInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .map(([label, value]) =>
      typeof value === "string"
        ? `${label}:\n${value}`
        : `${label}:\n${JSON.stringify(value, null, 2)}`,
    )
    .join("\n\n");
}

let client: OpenAI | null = null;
/** The model actually used, once a fallback was needed (see modelFor). */
let fallbackModel: string | null = null;

/**
 * Best first. When the configured model isn't allowed for the OpenAI project (D-040), the first
 * of these the project can use is taken instead, then any other GPT model it can use.
 */
export const MODEL_PREFERENCE = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5-mini",
  "gpt-5.4-nano",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
];

/** The model to fall back to from the ones the project can use, or null if there's none. */
export function pickModel(available: string[], unavailable: string): string | null {
  const usable = available.filter((m) => m !== unavailable);
  return (
    MODEL_PREFERENCE.find((m) => usable.includes(m)) ??
    usable
      .filter((m) => /^gpt-/.test(m) && !/audio|realtime|image|tts|transcribe|search/.test(m))
      .sort()
      .at(-1) ??
    null
  );
}

/** The project can't use this model (OpenAI answers 403 or 404 "model_not_found"). */
function modelNotAllowed(e: unknown) {
  return (
    (e instanceof OpenAI.PermissionDeniedError || e instanceof OpenAI.NotFoundError) &&
    (e.code === "model_not_found" || /model/i.test(e.message))
  );
}

/**
 * Runs one prompt. `fake` answers instead of the AI in the browser tests. Throws AiError with
 * a message that can be shown to the rep as-is.
 */
export async function runPrompt<T>(
  id: PromptId,
  schema: z.ZodType<T>,
  input: Record<string, unknown>,
  fake: () => T,
): Promise<T> {
  const mode = aiMode();
  if (mode === "off") throw new AiError(AI_NOT_SET_UP);
  if (mode === "fake") return schema.parse(fake());

  const ai = (client ??= new OpenAI({ timeout: AI_TIMEOUT_MS, maxRetries: 0 }));
  const call = (model: string) =>
    ai.responses.parse({
      model,
      instructions: PROMPTS[id].system,
      input: formatInput(input),
      // Low reasoning effort keeps answers well inside the 30-second limit.
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(schema, `${id.toLowerCase()}_result`) },
    });
  let response;
  try {
    response = await call(fallbackModel ?? aiModel());
  } catch (e) {
    if (!modelNotAllowed(e) || fallbackModel) throw new AiError(explain(e));
    // The configured model isn't allowed for this OpenAI project: use the best one that is.
    try {
      const available: string[] = [];
      for await (const m of ai.models.list()) available.push(m.id);
      const next = pickModel(available, aiModel());
      if (!next) throw e;
      console.warn(`AI: ${aiModel()} isn't allowed for this OpenAI project; using ${next}.`);
      fallbackModel = next;
      response = await call(next);
    } catch (e2) {
      throw new AiError(explain(e2));
    }
  }
  const refused = response.output.some(
    (item) => item.type === "message" && item.content.some((c) => c.type === "refusal"),
  );
  if (refused) {
    throw new AiError("The AI declined to answer this one. Try rewording, or write it yourself.");
  }
  if (response.status === "incomplete" || !response.output_parsed) {
    throw new AiError("The AI's answer came back incomplete. Try again.");
  }
  const checked = schema.safeParse(response.output_parsed);
  if (!checked.success) {
    throw new AiError("The AI's answer wasn't in the expected shape. Try again.");
  }
  return checked.data;
}

function explain(e: unknown): string {
  if (e instanceof OpenAI.APIConnectionTimeoutError) {
    return "The AI took longer than 30 seconds. Try again.";
  }
  if (modelNotAllowed(e)) {
    return `The OpenAI project behind this key can't use the model ${fallbackModel ?? aiModel()}. An Admin should allow it in OpenAI (Project → Limits → Model usage) or set OPENAI_MODEL to one it can use.`;
  }
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
    return "The AI key was refused. An Admin should check OPENAI_API_KEY.";
  }
  if (e instanceof OpenAI.RateLimitError) {
    return "The AI is busy right now (or the account is out of credit). Wait a minute and try again.";
  }
  if (e instanceof OpenAI.NotFoundError) {
    return "The AI service couldn't find what it was asked for. Try again.";
  }
  if (e instanceof OpenAI.APIConnectionError) {
    return "Couldn't reach the AI service. Check the internet connection and try again.";
  }
  if (e instanceof OpenAI.APIError) {
    console.error(`AI call failed: ${e.status} ${e.message}`);
    return "The AI service had a problem. Try again.";
  }
  console.error("AI call failed:", e instanceof Error ? e.message : e);
  return "The AI service had a problem. Try again.";
}
