import type { ReactNode } from "react";
import styles from "./Badge.module.scss";

type Props = {
  tone?: "neutral" | "primary" | "success" | "danger" | "warning";
  children: ReactNode;
};

/** A small coloured label, e.g. "Admin" or "Deactivated". */
export function Badge({ tone = "neutral", children }: Props) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
