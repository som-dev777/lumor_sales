import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.scss";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Shows a busy state and blocks double clicks (PRD: feedback within 400 ms). */
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = "button",
  ...rest
}: Props) {
  const classes = [styles.button, styles[variant], fullWidth ? styles.full : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden />}
      {children}
    </button>
  );
}
