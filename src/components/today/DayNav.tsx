import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { addDaysIst, formatIstDate } from "@/lib/time";
import styles from "./today.module.scss";

/** Previous day / Next day on Today (D-057): 7 days back and 7 ahead. */
export function DayNav({ today, day, range }: { today: string; day: string; range: number }) {
  const prev = addDaysIst(day, -1);
  const next = addDaysIst(day, 1);
  const href = (d: string) => (d === today ? "/" : `/?day=${d}`);
  const canPrev = prev >= addDaysIst(today, -range);
  const canNext = next <= addDaysIst(today, range);
  return (
    <nav className={styles.dayNav} aria-label="Choose a day">
      {canPrev ? (
        <Link href={href(prev)} className={styles.dayButton} aria-label="Previous day">
          <ChevronLeft size={16} aria-hidden /> Previous day
        </Link>
      ) : (
        <span className={styles.dayButtonOff} aria-disabled>
          <ChevronLeft size={16} aria-hidden /> Previous day
        </span>
      )}
      <span className={styles.dayLabel}>
        {day === today ? "Today" : formatIstDate(day, "EEEE d MMMM")}
      </span>
      {canNext ? (
        <Link href={href(next)} className={styles.dayButton} aria-label="Next day">
          Next day <ChevronRight size={16} aria-hidden />
        </Link>
      ) : (
        <span className={styles.dayButtonOff} aria-disabled>
          Next day <ChevronRight size={16} aria-hidden />
        </span>
      )}
      {day !== today && (
        <Link href="/" className={styles.dayToday}>
          Back to today
        </Link>
      )}
    </nav>
  );
}
