import type { ReactNode } from "react";
import styles from "./StatusMessage.module.scss";

type Props = {
  tone?: "neutral" | "error";
  title: string;
  children?: ReactNode;
};

/** A centred message for loading, empty and error states (PRD: every list has all three). */
export function StatusMessage({ tone = "neutral", title, children }: Props) {
  return (
    <div className={`${styles.box} ${tone === "error" ? styles.error : ""}`} role="status">
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
