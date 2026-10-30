import Image from "next/image";
import styles from "./Brand.module.scss";

/** The Lumor icon (public/brand-icon.png, also the browser tab icon) with "Sales Hub". */
export function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className={`${styles.brand} ${size === "lg" ? styles.lg : ""}`}>
      <Image
        src="/brand-icon.png"
        alt="Lumor"
        width={512}
        height={512}
        className={styles.logo}
        priority
      />
      <span className={styles.name}>Sales Hub</span>
    </span>
  );
}
