import Link from "next/link";
import { StatusMessage } from "@/components/ui/StatusMessage";
import styles from "./not-found.module.scss";

// Shown for any address that doesn't exist.
export default function NotFound() {
  return (
    <main className={styles.page}>
      <StatusMessage title="Page not found">
        <p>
          This page doesn&apos;t exist. <Link href="/">Go to Today</Link>
        </p>
      </StatusMessage>
    </main>
  );
}
