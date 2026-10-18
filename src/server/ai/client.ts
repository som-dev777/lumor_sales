// Calling the AI for every AI feature (F08 Rank with AI, F09 Reply Assistant, F10 summary and
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

  client ??= new OpenAI({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  let response;
  try {
    response = await client.responses.parse({
      model: aiModel(),
      instructions: PROMPTS[id].system,
      input: formatInput(input),
      // Low reasoning effort keeps answers well inside the 30-second limit.
      reasoning: { effort: "low" },
      text: { format: zodTextFormat(schema, `${id.toLowerCase()}_result`) },
    });
  } catch (e) {
    throw new AiError(explain(e));
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
  if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
    return "The AI key was refused. An Admin should check OPENAI_API_KEY.";
  }
  if (e instanceof OpenAI.RateLimitError) {
    return "The AI is busy right now (or the account is out of credit). Wait a minute and try again.";
  }
  if (e instanceof OpenAI.NotFoundError) {
    return "The AI model wasn't found. An Admin should check OPENAI_MODEL.";
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
