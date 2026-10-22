// Plain names for the AI features that read knowledge files (F20). No server imports.
import type { AiPromptId } from "@/lib/db/enums";

export const PROMPT_LABEL: Record<AiPromptId, string> = {
  P01: "Today: Rank with AI (P01)",
  P02: "Reply Assistant (P02)",
  P03: "Summarise conversation (P03)",
  P04: "Draft message (P04)",
};

export const PROMPT_SHORT: Record<AiPromptId, string> = {
  P01: "Today",
  P02: "Reply",
  P03: "Summary",
  P04: "Draft",
};

export function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
