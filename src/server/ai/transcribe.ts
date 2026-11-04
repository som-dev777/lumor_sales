// Voice typing (D-055): the rep speaks, the browser records, and this turns the recording into
// text with OpenAI's speech-to-text. Server-side only, like every AI call (D-036). Nothing is
// stored: the recording is sent to OpenAI once and the text comes back to the text box.
import OpenAI, { toFile } from "openai";
import { AI_NOT_SET_UP, AiError, aiMode } from "./client";

/** Best first; whisper-1 is the fallback when the project can't use the newer model. */
export const TRANSCRIBE_MODELS = ["gpt-4o-mini-transcribe", "whisper-1"] as const;
/** A recording can be up to 3 minutes; a few MB at most. */
export const MAX_RECORDING_BYTES = 5 * 1024 * 1024;
export const MAX_RECORDING_SECONDS = 180;
/** What the browser tests get back instead of a real transcription. */
export const FAKE_TRANSCRIPT = "This is a test of voice typing.";

const TIMEOUT_MS = 60_000;
let client: OpenAI | null = null;
let usable: string | null = null;

const extension = (type: string) =>
  type.includes("mp4") || type.includes("m4a")
    ? "m4a"
    : type.includes("ogg")
      ? "ogg"
      : type.includes("wav")
        ? "wav"
        : type.includes("mpeg")
          ? "mp3"
          : "webm";

/** Checks the recording the browser sent. Returns a plain-words problem, or null if fine. */
export function recordingProblem(file: unknown): string | null {
  if (!(file instanceof Blob) || file.size === 0) return "Nothing was recorded. Try again.";
  if (file.size > MAX_RECORDING_BYTES)
    return "That recording is too long. Keep it under 3 minutes.";
  if (file.type && !/^(audio|video)\//.test(file.type)) return "That isn't a sound recording.";
  return null;
}

export async function transcribe(file: Blob): Promise<string> {
  const mode = aiMode();
  if (mode === "off") throw new AiError(AI_NOT_SET_UP);
  if (mode === "fake") return FAKE_TRANSCRIPT;
  const ai = (client ??= new OpenAI({ timeout: TIMEOUT_MS, maxRetries: 0 }));
  const type = file.type || "audio/webm";
  const upload = await toFile(file, `recording.${extension(type)}`, { type });
  const models = usable ? [usable] : [...TRANSCRIBE_MODELS];
  for (const model of models) {
    try {
      const r = await ai.audio.transcriptions.create({ file: upload, model });
      usable = model;
      const text = r.text.trim();
      if (!text) throw new AiError("Couldn't hear anything. Try again a little closer to the mic.");
      return text;
    } catch (e) {
      if (e instanceof AiError) throw e;
      const notAllowed =
        (e instanceof OpenAI.PermissionDeniedError || e instanceof OpenAI.NotFoundError) &&
        model !== models.at(-1);
      if (notAllowed) continue;
      if (e instanceof OpenAI.APIConnectionTimeoutError) {
        throw new AiError("Turning speech into text took too long. Try a shorter recording.");
      }
      if (e instanceof OpenAI.AuthenticationError || e instanceof OpenAI.PermissionDeniedError) {
        throw new AiError("The AI key was refused. An Admin should check OPENAI_API_KEY.");
      }
      if (e instanceof OpenAI.RateLimitError) {
        throw new AiError("The AI is busy right now. Wait a minute and try again.");
      }
      if (e instanceof OpenAI.BadRequestError) {
        throw new AiError("Couldn't read that recording. Try again.");
      }
      console.error("Transcription failed:", e instanceof Error ? e.message : e);
      throw new AiError("Couldn't turn the recording into text. Try again, or type it.");
    }
  }
  throw new AiError("Couldn't turn the recording into text. Try again, or type it.");
}
