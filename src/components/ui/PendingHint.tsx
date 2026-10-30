"use client";

import { useLinkStatus } from "next/link";
import styles from "./PendingHint.module.scss";

/** A small dot inside a Link that fades in while its page is loading (slow connections). */
export function PendingHint() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={`${styles.hint} ${pending ? styles.pending : ""}`} />;
}
