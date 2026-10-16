import { Suspense, type ReactNode } from "react";
import { StatusMessage } from "@/components/ui/StatusMessage";
import { can, type PlainAction } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { NotAllowed } from "./NotAllowed";

/**
 * Renders `children` only if the signed-in user may do `action` (checked on the server with
 * the shared permission check). Everyone else sees "Not allowed".
 */
export function RequirePermission({
  action,
  children,
}: {
  action: PlainAction;
  children: ReactNode;
}) {
  return (
    <Suspense fallback={<StatusMessage title="Loading…" />}>
      <Gate action={action}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ action, children }: { action: PlainAction; children: ReactNode }) {
  const viewer = await requireUser();
  return can(viewer, action) ? <>{children}</> : <NotAllowed />;
}
