import { can, type Actor, type LibraryItem } from "@/lib/permissions";
import type { ItemPermissions } from "./ItemActions";

/** What the signed-in person may do with one library item (checked again on the server). */
export function itemPermissions(
  viewer: Actor,
  item: LibraryItem & { status: string; proposalStatus: string },
): ItemPermissions {
  return {
    canEdit: can(viewer, "library.edit", item),
    canDelete: can(viewer, "library.delete", item),
    canPropose:
      can(viewer, "library.propose", item) &&
      item.status === "Active" &&
      item.proposalStatus !== "Proposed",
  };
}
