import type { ReactNode } from "react";
import styles from "./Alert.module.scss";

type Props = { tone?: "info" | "success" | "error" | "warning"; children: ReactNode };

/** A coloured message box, e.g. a form error or a "Password changed" confirmation. */
export function Alert({ tone = "info", children }: Props) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
