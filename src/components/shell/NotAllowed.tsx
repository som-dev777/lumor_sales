import Link from "next/link";
import { StatusMessage } from "@/components/ui/StatusMessage";

/** Shown when the server refuses a page (e.g. a User opening the Audit Log). */
export function NotAllowed() {
  return (
    <StatusMessage tone="error" title="Not allowed">
      <p>
        Only Admins can open this page. <Link href="/">Go to Today</Link>
      </p>
    </StatusMessage>
  );
}
