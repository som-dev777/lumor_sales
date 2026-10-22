import { redirect } from "next/navigation";

// Product Facts (F12) was replaced by AI Resources (F20, D-037).
export default function ProductFactsPage() {
  redirect("/ai-resources");
}
