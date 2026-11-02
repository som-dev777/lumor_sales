import { LinkIcon } from "lucide-react";
import styles from "@/components/calendar/calendar.module.scss";

// A wrong or changed booking address (D-042): a plain message, and no way into the app.
export default function PublicNotFound() {
  return (
    <div className={styles.notFound}>
      <LinkIcon size={28} aria-hidden />
      <h1 className={styles.bookingTitle}>This link doesn&rsquo;t work</h1>
      <p className={styles.muted}>
        The booking link may have changed or been typed wrongly. Please use the exact link you were
        sent, or ask the person who sent it for a new one.
      </p>
    </div>
  );
}
