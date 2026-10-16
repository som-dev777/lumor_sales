import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/auth/AuthForm.module.scss";
import { Alert } from "@/components/ui/Alert";

export const metadata: Metadata = { title: "Forgot password" };

// D-002: there's no email sending yet, so an Admin creates reset links.
export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className={styles.title}>Forgot your password?</h1>
      <div className={styles.stack}>
        <Alert tone="info">
          Ask your admin for a password reset link. They can create one from Settings → Users and
          send it to you. The link works once, for 24 hours.
        </Alert>
        <Link href="/login">Back to log in</Link>
      </div>
    </>
  );
}
