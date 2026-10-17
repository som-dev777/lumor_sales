import type { Metadata } from "next";
import { Suspense } from "react";
import { ConfirmEmailForm } from "@/components/auth/ConfirmEmailForm";

export const metadata: Metadata = { title: "Confirm your email" };

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <ConfirmEmailForm />
    </Suspense>
  );
}
