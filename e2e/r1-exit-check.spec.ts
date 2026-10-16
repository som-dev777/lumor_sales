// The R1 exit check from the PRD, automated: invite a user, deactivate them, confirm they're
// blocked, and confirm Audit Log entries can't be edited, not even by an Admin. Plus the
// other R1 rules: sign-up, roles, Not allowed pages, reset links, About.
import { createClient } from "@libsql/client";
import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Asha Rep", email: "asha@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function rowAction(name: string, item: string, confirm: string) {
  await admin.getByRole("button", { name: `Actions for ${name}` }).click();
  await admin.getByRole("menuitem", { name: item }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: confirm }).click();
  await expect(admin.getByRole("alertdialog")).toBeHidden();
}

const menuItems = (page: Page) => page.getByRole("navigation", { name: "Main" }).getByRole("link");

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  rep = await newPage(browser);
});

test("signed-out visitors are sent to the login page", async () => {
  await admin.goto("/people");
  await expect(admin).toHaveURL(/\/login\?next=%2Fpeople/);
});

test("a wrong password is refused", async () => {
  await logIn(admin, ADMIN.email, "not-the-password");
  await expect(admin.getByText("Wrong email or password.")).toBeVisible();
});

test("a default Admin logs in and sees all 11 menu items", async () => {
  await logIn(admin, ADMIN.email, ADMIN.password);
  await expect(admin).toHaveURL("/");
  await expect(menuItems(admin)).toHaveCount(11);
});

test("sign-up: only @lumor.tech, never a default Admin email", async () => {
  await rep.goto("/signup");
  const fill = async (email: string) => {
    await rep.getByLabel("Full name").fill(REP.name);
    await rep.getByLabel("Work email").fill(email);
    await rep.getByLabel("Password", { exact: true }).fill(REP.password);
    await rep.getByLabel("Confirm password").fill(REP.password);
    await rep.getByRole("button", { name: "Create account" }).click();
  };
  await fill("asha@gmail.com");
  await expect(rep.getByText("Use your @lumor.tech email.", { exact: true })).toBeVisible();
  await fill("prince@lumor.tech");
  await expect(rep.getByText(/already set up/)).toBeVisible();
  await fill(REP.email);
  await expect(rep).toHaveURL("/");
});

test("a User sees 9 menu items and is refused Admin pages", async () => {
  await expect(menuItems(rep)).toHaveCount(9);
  await expect(menuItems(rep).filter({ hasText: "Audit Log" })).toHaveCount(0);
  for (const path of ["/audit-log", "/approvals", "/settings/users"]) {
    await rep.goto(path);
    await expect(rep.getByText("Not allowed", { exact: true })).toBeVisible();
  }
  const exportRes = await rep.request.get("/audit-log/export");
  expect(exportRes.status()).toBe(403);
});

test("exit check: an Admin invites a user, who registers through the link", async ({ browser }) => {
  await admin.goto("/settings/users");
  await admin.getByRole("button", { name: "Invite person" }).click();
  await admin.getByLabel("Email").fill("partner@agency.com");
  await admin.getByRole("button", { name: "Create invite link" }).click();
  const link = await admin.getByRole("textbox", { name: "Invite link" }).inputValue();
  await admin.getByRole("button", { name: "Done" }).click();
  expect(link).toContain("/register/");

  const partner = await newPage(browser);
  await partner.goto(link);
  await partner.getByLabel("Full name").fill("Agency Partner");
  await partner.getByLabel("Password", { exact: true }).fill("partner-password-1");
  await partner.getByLabel("Confirm password").fill("partner-password-1");
  await partner.getByRole("button", { name: "Create account" }).click();
  await expect(partner).toHaveURL(/\/login\?registered=1/);
  await partner.goto(link);
  await expect(partner.getByText(/already been used/)).toBeVisible();
});

test("you can't change your own role or deactivate yourself", async () => {
  await admin.goto("/settings/users");
  await admin.getByRole("button", { name: "Actions for Somnath" }).click();
  await expect(admin.getByRole("menuitem", { name: "Deactivate" })).toHaveAttribute(
    "data-disabled",
  );
  await expect(admin.getByRole("menuitem", { name: "Make User" })).toHaveAttribute("data-disabled");
  await admin.keyboard.press("Escape");
});

test("exit check: deactivating a user blocks them at once", async () => {
  await rowAction(REP.name, "Deactivate", "Deactivate");
  await expect(admin.getByText(`${REP.name} deactivated.`)).toBeVisible();

  await rep.goto("/people");
  await expect(rep).toHaveURL(/\/disabled/);
  await expect(rep.getByText("Access disabled, contact your admin").first()).toBeVisible();

  await rep.getByRole("button", { name: "Log out" }).click();
  await logIn(rep, REP.email, REP.password);
  await expect(rep.getByText("Access disabled, contact your admin").first()).toBeVisible();
});

test("reactivating lets them back in; a reset link sets a new password", async () => {
  await rowAction(REP.name, "Reactivate", "Reactivate");
  await rowAction(REP.name, "Create password reset link", "Create link");
  const resetLink = await admin.getByRole("textbox", { name: "Reset link" }).inputValue();
  await admin.getByRole("button", { name: "Done" }).click();

  await rep.goto(resetLink);
  await rep.getByLabel("New password", { exact: true }).fill("rep-new-password");
  await rep.getByLabel("Confirm new password").fill("rep-new-password");
  await rep.getByRole("button", { name: "Save new password" }).click();
  await expect(rep).toHaveURL(/\/login\?reset=1/);
  await logIn(rep, REP.email, "rep-new-password");
  await expect(rep).toHaveURL("/");
});

test("the Audit Log shows every change, with no edit or delete controls", async () => {
  await admin.goto("/audit-log");
  for (const action of ["Deactivated", "Reactivated", "Created"]) {
    await expect(admin.getByRole("cell", { name: action }).first()).toBeVisible();
  }
  await expect(admin.getByRole("button", { name: /edit|delete/i })).toHaveCount(0);

  await admin.goto("/audit-log?action=Deactivated");
  await expect(admin.locator("tbody > tr")).toHaveCount(1);
  await admin.getByRole("button", { name: "Show details" }).click();
  await expect(admin.getByRole("columnheader", { name: "Before" })).toBeVisible();
});

test("exit check: audit entries can't be edited or deleted, even directly in the database", async () => {
  const db = createClient({ url: "file:.e2e/e2e.db" });
  const before = Number((await db.execute("SELECT count(*) AS n FROM audit_log")).rows[0].n);
  expect(before).toBeGreaterThan(5);
  await expect(db.execute("UPDATE audit_log SET record_name = 'tampered'")).rejects.toThrow(
    /audit_log is insert-only/,
  );
  await expect(db.execute("DELETE FROM audit_log")).rejects.toThrow(/audit_log is insert-only/);
  const after = Number((await db.execute("SELECT count(*) AS n FROM audit_log")).rows[0].n);
  expect(after).toBe(before);
  db.close();
});

test("About shows the current version", async () => {
  await rep.goto("/about");
  await expect(rep.getByText("Current version")).toBeVisible();
  await expect(rep.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible();
});

test("logging out ends the session", async () => {
  await admin.getByRole("button", { name: "Log out" }).click();
  await expect(admin).toHaveURL(/\/login/);
  await admin.goto("/settings");
  await expect(admin).toHaveURL(/\/login/);
});
