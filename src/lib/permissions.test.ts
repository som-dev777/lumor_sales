import { describe, expect, it } from "vitest";
import { assertCan, can, PermissionError, type Actor } from "./permissions";

const admin: Actor = { id: "admin-1", role: "Admin", active: true };
const rep: Actor = { id: "rep-1", role: "User", active: true };
const otherRep: Actor = { id: "rep-2", role: "User", active: true };
const inactiveAdmin: Actor = { ...admin, active: false };
const inactiveRep: Actor = { ...rep, active: false };

const repsLead = { ownerId: rep.id };
const official = { type: "Official" as const, ownerId: admin.id };
const repsPersonal = { type: "Personal" as const, ownerId: rep.id };

// One test per row of the PRD permission table (docs/roles-permissions.md).
describe("PRD permission table", () => {
  it("Invite users, assign roles, deactivate and reactivate: Admin yes, User no", () => {
    expect(can(admin, "user.manage")).toBe(true);
    expect(can(rep, "user.manage")).toBe(false);
  });

  it("View all companies, people, activities and dashboards: both", () => {
    expect(can(admin, "record.view")).toBe(true);
    expect(can(rep, "record.view")).toBe(true);
  });

  it("Create, edit and log activity on leads they own: both", () => {
    expect(can(rep, "lead.create")).toBe(true);
    expect(can(rep, "lead.edit", repsLead)).toBe(true);
    expect(can(admin, "lead.edit", { ownerId: admin.id })).toBe(true);
  });

  it("View and add notes on leads owned by others: both", () => {
    expect(can(otherRep, "record.view")).toBe(true);
    expect(can(otherRep, "lead.addNote")).toBe(true);
  });

  it("Log outreach on leads owned by others: Admin yes, User no (claimed)", () => {
    expect(can(admin, "lead.edit", repsLead)).toBe(true);
    expect(can(otherRep, "lead.edit", repsLead)).toBe(false);
  });

  it("Reassign the owner of a lead or company: Admin yes, User no", () => {
    expect(can(admin, "lead.reassign")).toBe(true);
    expect(can(rep, "lead.reassign")).toBe(false);
  });

  it("Create, edit and delete Official items: Admin yes, User no (lock icon)", () => {
    for (const action of ["library.create", "library.edit", "library.delete"] as const) {
      expect(can(admin, action, official)).toBe(true);
      expect(can(rep, action, official)).toBe(false);
    }
  });

  it("Create, edit and delete own Personal items: both", () => {
    for (const actor of [admin, rep]) {
      const own = { type: "Personal" as const, ownerId: actor.id };
      expect(can(actor, "library.create", { type: "Personal" })).toBe(true);
      expect(can(actor, "library.edit", own)).toBe(true);
      expect(can(actor, "library.delete", own)).toBe(true);
    }
  });

  it("…but not someone else's Personal items", () => {
    expect(can(otherRep, "library.edit", repsPersonal)).toBe(false);
    expect(can(otherRep, "library.delete", repsPersonal)).toBe(false);
  });

  it("View and duplicate anyone's Personal items: both", () => {
    expect(can(admin, "library.duplicate")).toBe(true);
    expect(can(otherRep, "library.duplicate")).toBe(true);
  });

  it("Propose a Personal item as Official: both, for their own Personal items", () => {
    expect(can(rep, "library.propose", repsPersonal)).toBe(true);
    expect(can(admin, "library.propose", { type: "Personal", ownerId: admin.id })).toBe(true);
    expect(can(otherRep, "library.propose", repsPersonal)).toBe(false);
    expect(can(admin, "library.propose", official)).toBe(false);
  });

  it("Plans (F17): Admins make Official plans; anyone makes and edits their own Personal ones", () => {
    expect(can(admin, "plan.create", official)).toBe(true);
    expect(can(rep, "plan.create", official)).toBe(false);
    expect(can(rep, "plan.create", repsPersonal)).toBe(true);
    expect(can(admin, "plan.edit", official)).toBe(true);
    expect(can(rep, "plan.edit", official)).toBe(false);
    expect(can(rep, "plan.edit", repsPersonal)).toBe(true);
    expect(can(otherRep, "plan.edit", repsPersonal)).toBe(false);
    expect(can(admin, "plan.edit", repsPersonal)).toBe(false);
  });

  it("Plans: everyone uses Official plans; Personal plans are their owner's (Admins see all)", () => {
    expect(can(rep, "plan.use", official)).toBe(true);
    expect(can(rep, "plan.use", repsPersonal)).toBe(true);
    expect(can(otherRep, "plan.use", repsPersonal)).toBe(false);
    expect(can(admin, "plan.use", repsPersonal)).toBe(true);
    expect(can(rep, "plan.propose", repsPersonal)).toBe(true);
    expect(can(otherRep, "plan.propose", repsPersonal)).toBe(false);
    expect(can(inactiveRep, "plan.use", official)).toBe(false);
  });

  it("AI Resources (F20): Admins change the AI knowledge and sales resources; Users read", () => {
    expect(can(admin, "knowledge.edit")).toBe(true);
    expect(can(rep, "knowledge.edit")).toBe(false);
    expect(can(admin, "resources.manage")).toBe(true);
    expect(can(rep, "resources.manage")).toBe(false);
    expect(can(rep, "record.view")).toBe(true);
  });

  it("Approve or reject proposals: Admin yes, User no", () => {
    expect(can(admin, "proposal.decide")).toBe(true);
    expect(can(rep, "proposal.decide")).toBe(false);
  });

  it("Read Product Facts and Playbook Settings: both", () => {
    expect(can(admin, "settings.read")).toBe(true);
    expect(can(rep, "settings.read")).toBe(true);
  });

  it("Edit Product Facts and Playbook Settings: Admin yes, User no", () => {
    expect(can(admin, "settings.edit")).toBe(true);
    expect(can(rep, "settings.edit")).toBe(false);
  });

  it("View the Audit Log: Admin yes, User no", () => {
    expect(can(admin, "audit.view")).toBe(true);
    expect(can(rep, "audit.view")).toBe(false);
  });

  it("Edit or delete Audit Log entries: no one", () => {
    expect(can(admin, "audit.modify")).toBe(false);
    expect(can(rep, "audit.modify")).toBe(false);
  });
});

describe("deactivated users", () => {
  it("can do nothing, not even read", () => {
    for (const actor of [inactiveAdmin, inactiveRep]) {
      expect(can(actor, "record.view")).toBe(false);
      expect(can(actor, "settings.read")).toBe(false);
      expect(can(actor, "user.manage")).toBe(false);
      expect(can(actor, "lead.edit", { ownerId: actor.id })).toBe(false);
      expect(can(actor, "library.create", { type: "Personal" })).toBe(false);
    }
  });
});

describe("assertCan", () => {
  it("passes silently when allowed", () => {
    expect(() => assertCan(admin, "user.manage")).not.toThrow();
  });

  it("throws 'Not allowed' when refused", () => {
    expect(() => assertCan(rep, "user.manage")).toThrow(PermissionError);
    expect(() => assertCan(rep, "user.manage")).toThrow("Not allowed");
  });

  it("tells a deactivated user to contact their admin", () => {
    expect(() => assertCan(inactiveRep, "record.view")).toThrow(
      "Access disabled, contact your admin",
    );
  });
});
