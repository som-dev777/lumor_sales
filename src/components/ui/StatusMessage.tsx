import type { ReactNode } from "react";
import { Spinner } from "./Spinner";
import styles from "./StatusMessage.module.scss";

type Props = {
  tone?: "neutral" | "error";
  title: string;
  children?: ReactNode;
  /** Show the spinning circle (D-059). Loading titles ("Loading…") show it by default. */
  loading?: boolean;
};

/** A centred message for loading, empty and error states (PRD: every list has all three). */
export function StatusMessage({ tone = "neutral", title, children, loading }: Props) {
  const spinning = loading ?? (tone === "neutral" && title.endsWith("…"));
  return (
    <div className={`${styles.box} ${tone === "error" ? styles.error : ""}`} role="status">
      {spinning && <Spinner size="lg" />}
      <p className={styles.title}>{title}</p>
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
