import styles from "./Spinner.module.scss";

/** A spinning circle: the app is working (D-059). */
export function Spinner({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  return (
    <span
      className={`${styles.spinner} ${styles[size]}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
