"use client";

import { StatusMessage } from "@/components/ui/StatusMessage";
import styles from "./error.module.scss";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusMessage tone="error" title="Something went wrong">
      <p>The page couldn&apos;t load. Your data is safe. Try again, or reload the page.</p>
      <button type="button" className={styles.retry} onClick={reset}>
        Try again
      </button>
    </StatusMessage>
  );
}
