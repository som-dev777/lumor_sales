import { Badge } from "@/components/ui/Badge";
import type { Stage } from "@/lib/db/enums";

const TONE: Record<Stage, "neutral" | "primary" | "success" | "danger" | "warning"> = {
  Prospect: "neutral",
  Contacted: "neutral",
  Connected: "primary",
  Replied: "warning",
  "Meeting scheduled": "warning",
  "Meeting done": "warning",
  "Proposal sent": "warning",
  Trial: "warning",
  Paid: "success",
  "Active customer": "success",
  Lost: "danger",
};

/** A lead's stage as a coloured label (PRD: green for paid, red for lost). */
export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={TONE[stage]}>{stage}</Badge>;
}
