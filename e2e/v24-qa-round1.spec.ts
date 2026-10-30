// The owner's first live QA round (v2.4.0, D-040), automated. Named "v24-…" so it runs after
// the r1–r9 tests, which count the people they add: a person needs a company; Add
// person from a company page; editable company notes; Admins merge and delete companies and
// delete people; the Industries list; My leads / All leads; adding people counts as new outreach;
// logging in after a password reset, even after wrong guesses.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Vera Rep", email: "vera@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
let companyUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await shown(page.getByLabel("Email")).fill(email);
  await shown(page.getByLabel("Password")).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function addCompany(page: Page, name: string) {
  await page.goto("/companies");
  await shown(page.getByRole("button", { name: "Add company" })).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Company name").fill(name);
  await d.getByRole("button", { name: "Add company" }).click();
  await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
  return new URL(page.url()).pathname;
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await logIn(admin, ADMIN.email, ADMIN.password);
  await expect(admin).toHaveURL("/");

  rep = await newPage(browser);
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("a person can't be added without a company; the list shows existing companies", async () => {
  companyUrl = await addCompany(rep, "Northwind QA");
  await rep.goto("/people");
  await shown(rep.getByRole("button", { name: "Add person" })).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Full name").fill("Nina Noco");
  await d.getByLabel("LinkedIn profile link").fill("linkedin.com/in/nina-noco-qa");
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(shown(d.getByText("Choose the company."))).toBeVisible();
  await expect(d.getByLabel("Company").locator("option", { hasText: "Northwind QA" })).toHaveCount(
    1,
  );
  await d.getByLabel("Company").selectOption({ label: "Northwind QA" });
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(rep.getByRole("link", { name: "Northwind QA" })).toBeVisible();
});

test("Add person from a company page fills in the company; notes are editable", async () => {
  await rep.goto(companyUrl);
  const people = shown(rep.getByRole("region", { name: "People" }));
  await people.getByRole("button", { name: "Add person" }).click();
  const d = rep.getByRole("dialog");
  await expect(d.getByLabel("Company")).toHaveValue("Northwind QA");
  await d.getByLabel("Full name").fill("Omar Shortcut");
  await d.getByLabel("LinkedIn profile link").fill("linkedin.com/in/omar-shortcut-qa");
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  await rep.goto(companyUrl);
  await expect(shown(rep.getByRole("region", { name: "People" }))).toContainText("Omar Shortcut");
  const notes = shown(rep.getByRole("region", { name: "Notes" }));
  await notes.getByRole("button", { name: "Add notes" }).click();
  await notes.getByLabel("Notes").fill("Decision maker is the Head of Insights.");
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(shown(rep.getByText("Notes saved."))).toBeVisible();
  await rep.reload();
  await expect(shown(rep.getByRole("region", { name: "Notes" }))).toContainText(
    "Decision maker is the Head of Insights.",
  );
  await notes.getByRole("button", { name: "Edit notes" }).click();
  await notes.getByLabel("Notes").fill("Decision maker: Head of Insights. Budget in Q1.");
  await notes.getByRole("button", { name: "Save notes" }).click();
  await expect(notes).toContainText("Budget in Q1.");
});

test("adding people counts as new outreach on Today", async () => {
  await rep.goto("/");
  await expect(shown(rep.getByText("2 of 20 new people today"))).toBeVisible();
});

test("My leads and All leads show different people", async () => {
  // The Admin adds one lead of their own.
  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("Full name").fill("Adam Adminlead");
  await d.getByLabel("LinkedIn profile link").fill("linkedin.com/in/adam-adminlead-qa");
  await d.getByLabel("Company").selectOption({ label: "Northwind QA" });
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  await admin.goto("/people");
  const table = () => shown(admin.getByRole("table"));
  await expect(table()).toContainText("Omar Shortcut");
  await shown(admin.getByRole("link", { name: "My leads" })).click();
  await expect(admin).toHaveURL(/view=mine/);
  await expect(table()).toContainText("Adam Adminlead");
  await expect(table()).not.toContainText("Omar Shortcut");
  await shown(admin.getByRole("link", { name: "All leads" })).click();
  await expect(admin).toHaveURL(/view=all/);
  await expect(table()).toContainText("Omar Shortcut");
});

test("Admins merge and delete companies and delete people", async () => {
  const dupeUrl = await addCompany(admin, "Northwind QA Pvt Ltd");
  await shown(admin.getByRole("button", { name: "Merge" })).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("Merge into").selectOption({ label: "Northwind QA" });
  await d.getByRole("button", { name: "Merge" }).click();
  await expect(admin).toHaveURL(companyUrl);
  await expect(shown(admin.getByText(/Merged into Northwind QA/))).toBeVisible();
  await admin.goto(dupeUrl);
  await expect(shown(admin.getByText("Page not found"))).toBeVisible();

  // A company with people can't be deleted.
  await admin.goto(companyUrl);
  await shown(admin.getByRole("button", { name: "Delete", exact: true })).click();
  await expect(admin.getByRole("alertdialog").or(admin.getByRole("dialog"))).toContainText(
    "Merge it into another company, or delete them first.",
  );
  await admin.keyboard.press("Escape");

  // Delete a person.
  await shown(admin.getByRole("region", { name: "People" }))
    .getByRole("link", { name: "Adam Adminlead" })
    .click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await shown(admin.getByRole("button", { name: "Delete", exact: true })).click();
  await admin.getByRole("button", { name: "Delete person" }).click();
  await expect(admin).toHaveURL(/\/people$/);
  await expect(shown(admin.getByText("Adam Adminlead deleted."))).toBeVisible();

  // Reps don't see the delete or merge buttons.
  await rep.goto(companyUrl);
  await expect(rep.getByRole("button", { name: "Merge" })).toHaveCount(0);
  await expect(rep.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
});

test("Industries: anyone adds, Admins rename and delete; companies pick from the list", async () => {
  await rep.goto("/settings/industries");
  await shown(rep.getByLabel("New industry")).fill("Quantum Research");
  await shown(rep.getByRole("button", { name: "Add", exact: true })).click();
  await expect(shown(rep.getByText("Quantum Research added."))).toBeVisible();
  await expect(rep.getByRole("button", { name: "Edit Quantum Research" })).toHaveCount(0);

  await rep.goto(companyUrl);
  await shown(rep.getByRole("button", { name: "Edit", exact: true })).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Industry").selectOption({ label: "Quantum Research" });
  await d.getByRole("button", { name: "Save changes" }).click();
  await expect(shown(rep.getByText("Northwind QA saved."))).toBeVisible();

  await admin.goto("/settings/industries");
  const item = shown(admin.getByRole("listitem", { name: "Quantum Research" }));
  await expect(item).toContainText("used by 1 company");
  await item.getByRole("button", { name: "Edit Quantum Research" }).click();
  await shown(admin.getByLabel("Rename Quantum Research")).fill("Quantum & Deep Tech");
  await shown(admin.getByRole("button", { name: "Save", exact: true })).click();
  await expect(shown(admin.getByText("Quantum & Deep Tech saved."))).toBeVisible();
  await admin.goto(companyUrl);
  await expect(shown(admin.locator("dl"))).toContainText("Quantum & Deep Tech");

  await admin.goto("/settings/industries");
  await shown(admin.getByRole("button", { name: "Delete Quantum & Deep Tech" })).click();
  await admin.getByRole("button", { name: "Delete industry" }).click();
  await expect(shown(admin.getByText("Quantum & Deep Tech deleted."))).toBeVisible();
});

test("after a password reset, the person logs in, even after 5 wrong guesses", async () => {
  await rep.getByRole("button", { name: "Log out" }).click();
  for (let i = 0; i < 5; i++) {
    await logIn(rep, REP.email, "wrong-password-xx");
    await expect(shown(rep.getByText(/Wrong email or password|paused/))).toBeVisible();
  }
  await admin.goto("/settings/users");
  await shown(admin.getByRole("button", { name: `Actions for ${REP.name}` })).click();
  await admin.getByRole("menuitem", { name: "Create password reset link" }).click();
  await admin.getByRole("alertdialog").getByRole("button", { name: "Create link" }).click();
  const resetLink = await admin.getByRole("textbox", { name: "Reset link" }).inputValue();
  await admin.getByRole("button", { name: "Done" }).click();

  await rep.goto(resetLink);
  await shown(rep.getByLabel("New password", { exact: true })).fill("vera-new-password");
  await shown(rep.getByLabel("Confirm new password")).fill("vera-new-password");
  await rep.getByRole("button", { name: "Save new password" }).click();
  await expect(rep).toHaveURL(/\/login\?reset=1/);
  await logIn(rep, REP.email.toUpperCase(), "vera-new-password");
  await expect(rep).toHaveURL("/");
});
