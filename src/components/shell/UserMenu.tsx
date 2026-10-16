import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import type { Viewer } from "@/lib/session";
import styles from "./UserMenu.module.scss";

/** Bottom of the sidebar: who is signed in, and Log out. */
export function UserMenu({ viewer }: { viewer: Viewer }) {
  return (
    <div className={styles.menu}>
      <div className={styles.who}>
        <span className={styles.name}>{viewer.name}</span>
        <span className={styles.meta}>
          {viewer.role} · <Link href="/change-password">Change password</Link>
        </span>
      </div>
      <LogoutButton />
    </div>
  );
}
