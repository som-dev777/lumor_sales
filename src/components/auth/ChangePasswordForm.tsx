"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/auth";
import { changePassword } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";
import { useServerResult } from "./useServerResult";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema) });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    apply(await changePassword(values));
  });

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {forced && (
        <Alert tone="warning">
          You signed in with a one-time password. Choose your own password before continuing.
        </Alert>
      )}
      {formError && <Alert tone="error">{formError}</Alert>}
      <TextField
        label={forced ? "One-time password" : "Current password"}
        type="password"
        autoComplete="current-password"
        autoFocus
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />
      <TextField
        label="New password"
        type="password"
        autoComplete="new-password"
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
  );
}
