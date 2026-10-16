import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChangePasswordForm } from "@/components/auth/ChangePasswordForm";
import styles from "@/components/auth/AuthForm.module.scss";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Change password" };

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ChangePassword />
    </Suspense>
  );
}

async function ChangePassword() {
  const viewer = await requireUser({ allowPendingPasswordChange: true });
  return (
    <>
      <h1 className={styles.title}>Change password</h1>
      <p className={styles.intro}>Signed in as {viewer.email}</p>
      <ChangePasswordForm forced={viewer.mustChangePassword} />
      <div className={styles.footer}>
        {viewer.mustChangePassword ? <LogoutButton /> : <Link href="/">Back to the app</Link>}
      </div>
    </>
  );
}
