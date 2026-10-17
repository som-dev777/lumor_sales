import { Badge } from "@/components/ui/Badge";
import type { Stage } from "@/lib/db/enums";

const TONE: Record<Stage, "neutral" | "primary" | "success" | "danger" | "warning"> = {
  Prospect: "neutral",
  "Request sent": "neutral",
  Connected: "primary",
  Messaged: "primary",
  Replied: "warning",
  "Demo booked": "warning",
  "Demo done": "warning",
  "Trial/Pilot": "warning",
  Paid: "success",
  Lost: "danger",
};

/** A lead's stage as a coloured label (PRD: green for paid, red for lost). */
export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={TONE[stage]}>{stage}</Badge>;
}
