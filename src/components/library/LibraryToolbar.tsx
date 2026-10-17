import Link from "next/link";
import type { ReactNode } from "react";
import type { LibraryTab } from "@/server/library/queries";
import styles from "./library.module.scss";

type Props = {
  basePath: string;
  tab: LibraryTab;
  counts: { official: number; personal: number };
  archived: boolean;
  mine: boolean;
  /** e.g. the Add button */
  action?: ReactNode;
};

/** Official / Personal tabs and the "Show archived" / "Mine only" switches, kept in the address. */
export function LibraryToolbar({ basePath, tab, counts, archived, mine, action }: Props) {
  const href = (next: { tab?: LibraryTab; archived?: boolean; mine?: boolean }) => {
    const t = next.tab ?? tab;
    const p = new URLSearchParams();
    if (t === "personal") p.set("tab", "personal");
    if (next.archived ?? archived) p.set("archived", "1");
    if (t === "personal" && (next.mine ?? mine)) p.set("mine", "1");
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <div className={styles.toolbar}>
      <nav className={styles.tabs} aria-label="Official or Personal">
        <Link
          href={href({ tab: "official" })}
          className={`${styles.tab} ${tab === "official" ? styles.activeTab : ""}`}
          aria-current={tab === "official" ? "page" : undefined}
        >
          Official<span className={styles.count}>{counts.official}</span>
        </Link>
        <Link
          href={href({ tab: "personal" })}
          className={`${styles.tab} ${tab === "personal" ? styles.activeTab : ""}`}
          aria-current={tab === "personal" ? "page" : undefined}
        >
          Personal<span className={styles.count}>{counts.personal}</span>
        </Link>
      </nav>
      <div className={styles.switches}>
        {tab === "personal" && (
          <Link
            href={href({ mine: !mine })}
            className={`${styles.switch} ${mine ? styles.switchOn : ""}`}
            aria-pressed={mine}
          >
            Mine only
          </Link>
        )}
        <Link
          href={href({ archived: !archived })}
          className={`${styles.switch} ${archived ? styles.switchOn : ""}`}
          aria-pressed={archived}
        >
          Show archived
        </Link>
        {action}
      </div>
    </div>
  );
}
