import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/LoginForm";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <Suspense fallback={<p>Loading…</p>}>
        <LoginForm />
      </Suspense>
    </>
  );
}
