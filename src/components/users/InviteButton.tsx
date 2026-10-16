"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useServerResult } from "@/components/auth/useServerResult";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Dialog } from "@/components/ui/Dialog";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { inviteSchema, type InviteInput } from "@/lib/validation/users";
import { invite } from "@/server/actions/users";
import styles from "./users.module.scss";

const ROLE_OPTIONS = [
  { value: "User", label: "User (sales rep)" },
  { value: "Admin", label: "Admin" },
] as const;

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "User" },
  });
  const { formError, apply, clear } = useServerResult(setError);

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setLink(null);
      reset({ email: "", role: "User" });
      clear();
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await invite(values);
    apply(result);
    if (result.ok && result.link) setLink(result.link);
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus size={16} aria-hidden />
        Invite person
      </Button>
      <Dialog
        open={open}
        onOpenChange={close}
        title={link ? "Invite link ready" : "Invite a person"}
        description={
          link
            ? `Send this link to ${getValues("email")} (WhatsApp, Slack or email). It works once, for 7 days.`
            : "Anyone with an @lumor.tech email can also sign up themselves. Use an invite for other emails, or to make someone an Admin straight away."
        }
      >
        {link ? (
          <div className={styles.stack}>
            <CopyField label="Invite link" value={link} />
            <div className={styles.dialogActions}>
              <Button
                variant="secondary"
                onClick={() => {
                  setLink(null);
                  reset({ email: "", role: "User" });
                }}
              >
                Invite another
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form className={styles.stack} onSubmit={onSubmit} noValidate>
            {formError && <Alert tone="error">{formError}</Alert>}
            <TextField
              label="Email"
              type="email"
              autoComplete="off"
              autoFocus
              error={errors.email?.message}
              {...register("email")}
            />
            <SelectField
              label="Role"
              options={ROLE_OPTIONS}
              error={errors.role?.message}
              {...register("role")}
            />
            <div className={styles.dialogActions}>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Create invite link
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
