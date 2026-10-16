import type { ReactNode } from "react";
import styles from "./AppShell.module.scss";

/** The page frame: the sidebar on the left, the page content on the right. */
export function AppShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {sidebar}
      <main className={styles.main}>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
