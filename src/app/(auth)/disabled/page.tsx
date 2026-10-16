import type { Metadata } from "next";
import styles from "@/components/auth/AuthForm.module.scss";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Alert } from "@/components/ui/Alert";

export const metadata: Metadata = { title: "Access disabled" };

// Where a deactivated user lands on any page (PRD: "Access disabled, contact your admin").
export default function DisabledPage() {
  return (
    <>
      <h1 className={styles.title}>Access disabled</h1>
      <div className={styles.stack}>
        <Alert tone="error">Access disabled, contact your admin.</Alert>
        <LogoutButton variant="secondary" />
      </div>
    </>
  );
}
