import { Construction } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./ComingSoon.module.scss";

type Props = {
  /** e.g. "F02 People" */
  feature: string;
  /** e.g. "R3 (v1.2.0)" */
  release: string;
  children?: ReactNode;
};

/** Placeholder for a screen that a later release builds. */
export function ComingSoon({ feature, release, children }: Props) {
  return (
    <section className={styles.card}>
      <Construction size={28} className={styles.icon} aria-hidden />
      <h2 className={styles.title}>Coming in {release}</h2>
      <p className={styles.feature}>{feature}</p>
      {children && <div className={styles.body}>{children}</div>}
    </section>
  );
}
