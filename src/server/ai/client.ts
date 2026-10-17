// Calling Claude for the AI features (F08–F10). Server-side only: the API key never reaches
// the browser. Each call sends one prompt from prompts.ts plus labelled data, and gets back a
// JSON answer in a fixed shape (structured outputs), checked with Zod before use.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { PROMPTS, type PromptId } from "./prompts";

export const AI_MODEL = "claude-opus-5-5";
/** PRD: AI responses time out after 30 seconds, with a retry option on screen. */
export const AI_TIMEOUT_MS = 30_000;

export const AI_NOT_SET_UP =
  "AI isn't set up yet. An Admin needs to add ANTHROPIC_API_KEY (see docs/deploy.md).";

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

/**
 * "live" with an API key; "fake" for the automated browser tests (AI_FAKE=1, and only with a
 * local database file, so it can never switch on in production); otherwise "off".
 */
export function aiMode(): "live" | "fake" | "off" {
  if (process.env.AI_FAKE === "1" && (process.env.DATABASE_URL ?? "").startsWith("file:")) {
    return "fake";
  }
  return process.env.ANTHROPIC_API_KEY?.trim() ? "live" : "off";
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

let client: Anthropic | null = null;

/**
 * Runs one prompt. `fake` answers instead of Claude in the browser tests. Throws AiError with
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

  client ??= new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      // If the model declines for policy reasons, the API retries on its default fallback.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: PROMPTS[id].system,
      messages: [{ role: "user", content: formatInput(input) }],
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
    });
  } catch (e) {
    throw new AiError(explain(e));
  }
  if (response.stop_reason === "refusal") {
    throw new AiError("The AI declined to answer this one. Try rewording, or write it yourself.");
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new AiError("The AI's answer came back incomplete. Try again.");
  }
  const checked = schema.safeParse(response.parsed_output);
  if (!checked.success)
    throw new AiError("The AI's answer wasn't in the expected shape. Try again.");
  return checked.data;
}

function explain(e: unknown): string {
  if (e instanceof Anthropic.APIConnectionTimeoutError) {
    return "The AI took longer than 30 seconds. Try again.";
  }
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return "The AI key was refused. An Admin should check ANTHROPIC_API_KEY.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "The AI is busy right now. Wait a minute and try again.";
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach the AI service. Check the internet connection and try again.";
  }
  if (e instanceof Anthropic.APIError) {
    console.error(`AI call failed: ${e.status} ${e.message}`);
    return "The AI service had a problem. Try again.";
  }
  console.error("AI call failed:", e instanceof Error ? e.message : e);
  return "The AI service had a problem. Try again.";
}
