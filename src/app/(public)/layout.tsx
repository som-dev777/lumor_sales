import Image from "next/image";
import styles from "@/components/calendar/calendar.module.scss";

// The public booking pages (F22): no sidebar, no sign-in and no links into the app. The
// owner's Lumor logo on top and at the foot (D-043).
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main className={styles.public}>
      <div className={styles.publicTop}>
        <Image src="/lumor-logo.png" alt="Lumor" width={124} height={36} priority />
      </div>
      <div className={styles.publicCard}>{children}</div>
      <p className={styles.publicFoot}>
        <Image src="/lumor-logo.png" alt="Lumor" width={69} height={20} />
      </p>
    </main>
  );
}
