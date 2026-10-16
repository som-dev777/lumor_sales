// Who is signed in, and the checks every page and Server Action starts with.
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDb } from "./db/client";
import { user } from "./db/schema";
import type { Actor } from "./permissions";

export type Viewer = Actor & {
  name: string;
  email: string;
  mustChangePassword: boolean;
};

/**
 * The signed-in user, read fresh from the database (so a role change or deactivation
 * applies on the very next click). null if nobody is signed in. Cached per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const current = await getAuth().api.getSession({ headers: await headers() });
  if (!current) return null;
  const [row] = await getDb()
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      mustChangePassword: user.mustChangePassword,
    })
    .from(user)
    .where(eq(user.id, current.user.id));
  return row ?? null;
});

/**
 * Every protected page and Server Action calls this first. It sends people elsewhere when:
 * - nobody is signed in → /login
 * - the account is deactivated → /disabled ("Access disabled, contact your admin")
 * - a password change is pending (D-006) → /change-password
 */
export async function requireUser({
  allowPendingPasswordChange = false,
}: { allowPendingPasswordChange?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.active) redirect("/disabled");
  if (viewer.mustChangePassword && !allowPendingPasswordChange) redirect("/change-password");
  return viewer;
}
