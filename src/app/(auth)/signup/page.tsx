import type { Metadata } from "next";
import { Suspense } from "react";
import { RedirectIfSignedIn } from "@/components/auth/RedirectIfSignedIn";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <>
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <SignupForm />
    </>
  );
}
