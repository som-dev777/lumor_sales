"use client";

// Check now (F30, D-066): reads the rep's new LinkedIn emails from Gmail and says what was logged.
import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { checkLinkedInEmails } from "@/server/actions/sprint";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CheckEmailsButton() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const check = () =>
    start(async () => {
      const r = await checkLinkedInEmails();
      if (!r.ok) {
        notify("error", r.error);
        return;
      }
      const d = r.data!;
      if (d.read === 0) {
        notify("success", "No new LinkedIn emails.");
        return;
      }
      const parts = [
        d.accepted && plural(d.accepted, "acceptance"),
        d.replies && plural(d.replies, "reply", "replies"),
      ].filter(Boolean);
      notify(
        "success",
        `Read ${plural(d.read, "LinkedIn email")}. ${
          parts.length ? `Logged ${parts.join(" and ")}.` : "Nothing new to log."
        }${d.notMatched ? ` ${plural(d.notMatched, "email")} didn't match anyone.` : ""}`,
      );
    });
  return (
    <Button variant="secondary" onClick={check} loading={pending}>
      <RefreshCw size={16} aria-hidden />
      Check now
    </Button>
  );
}
