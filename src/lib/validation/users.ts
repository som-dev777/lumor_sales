import { z } from "zod";
import { ROLES } from "../db/enums";

export const inviteSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  role: z.enum(ROLES),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const userIdSchema = z.uuid();
export const roleSchema = z.enum(ROLES);
