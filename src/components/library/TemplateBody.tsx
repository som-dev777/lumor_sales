import { splitPlaceholders } from "@/lib/validation/library";
import styles from "./library.module.scss";

/** A template's wording with {Placeholders} highlighted. */
export function TemplateBody({ body }: { body: string }) {
  return (
    <p className={styles.body}>
      {splitPlaceholders(body).map((part, i) =>
        part.placeholder ? (
          <mark key={i} className={styles.placeholder}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}
