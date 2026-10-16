import Image from "next/image";
import styles from "./Brand.module.scss";

/** The Lumor logo with "Sales Hub" in Bricolage Grotesque. */
export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`${styles.brand} ${size === "lg" ? styles.lg : ""}`}>
      <Image
        src="/lumor-logo.png"
        alt="Lumor"
        width={553}
        height={160}
        className={styles.logo}
        priority
      />
      <span className={styles.name}>Sales Hub</span>
    </span>
  );
}
