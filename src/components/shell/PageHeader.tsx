import type { ReactNode } from "react";
import styles from "./PageHeader.module.scss";

type Props = {
  title: string;
  description?: ReactNode;
  /** Buttons on the right, e.g. "Invite user". */
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
