import { Brand } from "@/components/shell/Brand";
import styles from "./auth.module.scss";

// Login, registration and password screens: logo on top, one centred card.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <Brand size="lg" />
      </div>
      <div className={styles.card}>{children}</div>
    </main>
  );
}
