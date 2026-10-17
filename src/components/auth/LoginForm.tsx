"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { SIGNUP_EMAIL_DOMAIN } from "@/lib/auth-rules";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { login } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";
import { useServerResult } from "./useServerResult";

export function LoginForm() {
  const params = useSearchParams();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    apply(await login(values, params.get("next") ?? undefined));
  });

  return (
    <>
      <h1 className={styles.title}>Log in</h1>
      <p className={styles.intro}>Welcome back. Log in with your work email.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {params.get("registered") && (
          <Alert tone="success">Your account is ready. Log in with your new password.</Alert>
        )}
        {params.get("confirm") && (
          <Alert tone="success">
            Account created. We&rsquo;ve emailed you a link: open it to confirm your email, then log
            in.
          </Alert>
        )}
        {params.get("confirmed") && (
          <Alert tone="success">Your email is confirmed. Log in to continue.</Alert>
        )}
        {params.get("reset") && (
          <Alert tone="success">Your password was changed. Log in with the new one.</Alert>
        )}
        {formError && <Alert tone="error">{formError}</Alert>}

        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          error={errors.email?.message}
          {...register("email")}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <Button type="submit" loading={isSubmitting} fullWidth>
          Log in
        </Button>
      </form>

      <p className={styles.footer}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p className={styles.footer}>
        New here? <Link href="/signup">Sign up with your @{SIGNUP_EMAIL_DOMAIN} email</Link>
      </p>
    </>
  );
}
