import Image from "next/image";
import styles from "@/components/calendar/calendar.module.scss";

// The public booking pages (F22): no sidebar and no sign-in; one centred card.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <main className={styles.public}>
      <div className={styles.publicCard}>{children}</div>
      <p className={styles.publicFoot}>
        <Image src="/brand-icon.png" alt="" width={14} height={14} /> Scheduling by Lumor
      </p>
    </main>
  );
}
