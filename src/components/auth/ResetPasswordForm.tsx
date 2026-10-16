"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import { resetPasswordSchema, type ResetPasswordInput } from "@/lib/validation/auth";
import { resetPassword } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";
import { useServerResult } from "./useServerResult";

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token },
  });
  const { formError, apply } = useServerResult(setError);

  if (!token) {
    return (
      <>
        <h1 className={styles.title}>Reset your password</h1>
        <div className={styles.stack}>
          <Alert tone="error">
            This link is missing its code. Ask your admin for a new reset link.
          </Alert>
          <Link href="/login">Back to log in</Link>
        </div>
      </>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    apply(await resetPassword(values));
  });

  return (
    <>
      <h1 className={styles.title}>Choose a new password</h1>
      <p className={styles.intro}>This will log you out on every other device.</p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <input type="hidden" {...register("token")} />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          autoFocus
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <Button type="submit" loading={isSubmitting} fullWidth>
          Save new password
        </Button>
      </form>
    </>
  );
}
