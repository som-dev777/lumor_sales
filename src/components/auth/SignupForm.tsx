"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PASSWORD_MIN_LENGTH, SIGNUP_EMAIL_DOMAIN } from "@/lib/auth-rules";
import { signupSchema, type SignupInput } from "@/lib/validation/auth";
import { signUp } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";
import { useServerResult } from "./useServerResult";

export function SignupForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    apply(await signUp(values));
  });

  return (
    <>
      <h1 className={styles.title}>Sign up</h1>
      <p className={styles.intro}>
        For the Lumor team. Use your @{SIGNUP_EMAIL_DOMAIN} email. Anyone else needs an invite from
        an Admin.
      </p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="Full name"
          autoComplete="name"
          autoFocus
          error={errors.name?.message}
          {...register("name")}
        />
        <TextField
          label="Work email"
          type="email"
          autoComplete="email"
          placeholder={`you@${SIGNUP_EMAIL_DOMAIN}`}
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" loading={isSubmitting} fullWidth>
          Create account
        </Button>
      </form>

      <p className={styles.footer}>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
