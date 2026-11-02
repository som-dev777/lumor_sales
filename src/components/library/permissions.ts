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
    // No approvals (D-043): the creator makes their own Personal item Official.
    canMakeOfficial:
      item.type === "Personal" && can(viewer, "library.edit", item) && item.status === "Active",
  };
}
