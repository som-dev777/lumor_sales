// The ONE shared permission check (docs/roles-permissions.md). Every Server Action and
// Route Handler calls assertCan() before changing or reading protected data.
// SQLite has no row-level security, so this function is the rule; hiding a button is not.
import type { Role } from "./db/enums";

export type Actor = { id: string; role: Role; active: boolean };

/** Anything with an owner: a lead (person), company, or library item. */
export type Owned = { ownerId: string };
/** A persona, account filter or template. */
export type LibraryItem = Owned & { type: "Official" | "Personal" };

/** Actions that need no record. */
type PlainAction =
  | "user.manage"
  | "record.view"
  | "lead.create"
  | "lead.addNote"
  | "lead.reassign"
  | "library.duplicate"
  | "proposal.decide"
  | "settings.read"
  | "settings.edit"
  | "audit.view"
  | "audit.modify";

/** Actions on a lead or company: the record's owner matters. */
type OwnedAction = "lead.edit";

/** Actions on a library item: its type (Official/Personal) and owner matter. */
type LibraryAction = "library.create" | "library.edit" | "library.delete" | "library.propose";

export type Action = PlainAction | OwnedAction | LibraryAction;

export function can(actor: Actor, action: PlainAction): boolean;
export function can(actor: Actor, action: OwnedAction, record: Owned): boolean;
export function can(
  actor: Actor,
  action: LibraryAction,
  item: Pick<LibraryItem, "type"> & Partial<Owned>,
): boolean;
export function can(actor: Actor, action: Action, record?: Partial<LibraryItem>): boolean {
  // Deactivated users can do nothing at all.
  if (!actor.active) return false;
  const isAdmin = actor.role === "Admin";
  const isOwner = record?.ownerId !== undefined && record.ownerId === actor.id;

  switch (action) {
    // Everyone (active) can read everything.
    case "record.view":
    case "settings.read":
    case "lead.create":
    case "lead.addNote":
    case "library.duplicate":
      return true;

    case "user.manage":
    case "lead.reassign":
    case "proposal.decide":
    case "settings.edit":
    case "audit.view":
      return isAdmin;

    // No one, not even Admin. The database triggers enforce this too.
    case "audit.modify":
      return false;

    // Log outreach / edit a lead: its owner, or an Admin.
    // A User on someone else's lead sees "This lead is claimed by {owner}".
    case "lead.edit":
      return isOwner || isAdmin;

    // Official items: Admin only (Users see a lock). Personal items: create freely,
    // edit and delete only your own.
    case "library.create":
      return record?.type === "Personal" || isAdmin;
    case "library.edit":
    case "library.delete":
      return record?.type === "Official" ? isAdmin : isOwner;

    // Propose your own Personal item as Official.
    case "library.propose":
      return record?.type === "Personal" && isOwner;
  }
}

export class PermissionError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "PermissionError";
  }
}

/** Throws PermissionError unless `can()` allows the action. */
export function assertCan(actor: Actor, action: PlainAction): void;
export function assertCan(actor: Actor, action: OwnedAction, record: Owned): void;
export function assertCan(
  actor: Actor,
  action: LibraryAction,
  item: Pick<LibraryItem, "type"> & Partial<Owned>,
): void;
export function assertCan(actor: Actor, action: Action, record?: Partial<LibraryItem>): void {
  if (!(can as (a: Actor, b: Action, c?: Partial<LibraryItem>) => boolean)(actor, action, record)) {
    throw new PermissionError(actor.active ? "Not allowed" : "Access disabled, contact your admin");
  }
}
