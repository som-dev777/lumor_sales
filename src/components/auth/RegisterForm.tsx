"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";
import { registerSchema, type RegisterInput } from "@/lib/validation/auth";
import { register as registerAccount } from "@/server/actions/auth";
import styles from "./AuthForm.module.scss";
import { useServerResult } from "./useServerResult";

type Props = { token: string; email: string; role: string };

export function RegisterForm({ token, email, role }: Props) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { token },
  });
  const { formError, apply } = useServerResult(setError);

  const onSubmit = handleSubmit(async (values) => {
    apply(await registerAccount(values));
  });

  return (
    <>
      <h1 className={styles.title}>Set up your account</h1>
      <p className={styles.intro}>
        You&apos;ve been invited to Lumor Sales Hub as {role === "Admin" ? "an Admin" : "a User"}.
      </p>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <input type="hidden" {...register("token")} />
        <TextField label="Email" type="email" value={email} readOnly autoComplete="username" />
        <TextField
          label="Full name"
          autoComplete="name"
          autoFocus
          error={errors.name?.message}
          {...register("name")}
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
    </>
  );
}
