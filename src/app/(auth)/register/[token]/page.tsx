import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/RegisterForm";
import styles from "@/components/auth/AuthForm.module.scss";
import { Alert } from "@/components/ui/Alert";
import { getDb } from "@/lib/db/client";
import { findUsableInvite } from "@/server/invites";

export const metadata: Metadata = { title: "Set up your account" };

export default function RegisterPage({ params }: PageProps<"/register/[token]">) {
  return (
    <Suspense fallback={<p>Checking your invite…</p>}>
      <Invite params={params} />
    </Suspense>
  );
}

async function Invite({ params }: Pick<PageProps<"/register/[token]">, "params">) {
  const { token } = await params;
  // Checking expiry uses the current time, so this runs per request (Cache Components).
  await connection();
  const found = await findUsableInvite(getDb(), decodeURIComponent(token));

  if (!found.ok) {
    return (
      <>
        <h1 className={styles.title}>Invite link</h1>
        <div className={styles.stack}>
          <Alert tone="error">{found.reason}</Alert>
          <Link href="/login">Go to log in</Link>
        </div>
      </>
    );
  }

  return <RegisterForm token={token} email={found.invite.email} role={found.invite.role} />;
}
