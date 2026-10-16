// Form rules for login and passwords. The same rules run in the browser (React Hook Form)
// and again on the server (Server Actions), so the server never trusts the browser.
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../auth-rules";

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`);

const confirmed = <T extends { password: string; confirmPassword: string }>(data: T) =>
  data.password === data.confirmPassword;
const mismatch = { message: "The two passwords don't match.", path: ["confirmPassword"] };

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Enter your password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    token: z.string().min(1),
    name: z.string().trim().min(2, "Enter your full name.").max(100, "Name is too long."),
    password,
    confirmPassword: z.string(),
  })
  .refine(confirmed, mismatch);
export type RegisterInput = z.infer<typeof registerSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password,
    confirmPassword: z.string(),
  })
  .refine(confirmed, mismatch);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password,
    confirmPassword: z.string(),
  })
  .refine(confirmed, mismatch)
  .refine((d) => d.password !== d.currentPassword, {
    message: "Choose a password different from the current one.",
    path: ["password"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
