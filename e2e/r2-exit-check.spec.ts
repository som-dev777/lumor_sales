// The R2 exit check from the PRD, automated: a User proposes a persona, an Admin approves it,
// and it shows as Official and locked. Plus the rest of the library: the seeded playbook,
// rejecting with a note, the waiting count, account filter codes and template revisions.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Ravi Rep", email: "ravi@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;

/** Only the visible match: streamed pages briefly hold a hidden copy of new content. */
const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const card = (page: Page, name: string) => page.getByRole("article", { name, exact: true });

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

async function cardAction(page: Page, name: string, item: string) {
  await card(page, name)
    .getByRole("button", { name: `Actions for ${name}` })
    .click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function confirm(page: Page, label: string) {
  await page.getByRole("alertdialog").getByRole("button", { name: label }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden();
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
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

test("the seeded playbook is there: 5 personas, A1–A6, 12 templates", async () => {
  await rep.goto("/personas");
  await expect(card(rep, "Research & Insights")).toBeVisible();
  await expect(rep.locator("article").filter({ visible: true })).toHaveCount(5);
  await rep.goto("/account-filters");
  await expect(card(rep, "A6 Consumer & D2C Brands")).toBeVisible();
  await expect(rep.locator("article").filter({ visible: true })).toHaveCount(6);
  await rep.goto("/templates");
  await expect(card(rep, "Reply – competitor")).toBeVisible();
  await expect(rep.locator("article").filter({ visible: true })).toHaveCount(12);
});

test("Official items are locked for a User", async () => {
  await rep.goto("/personas");
  await expect(
    card(rep, "Product & Design").getByLabel(/only its creator or an Admin can change it/),
  ).toBeVisible();
  await card(rep, "Product & Design")
    .getByRole("button", { name: "Actions for Product & Design" })
    .click();
  await expect(rep.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await expect(rep.getByRole("menuitem", { name: "Duplicate to my Personal" })).toBeVisible();
  await rep.keyboard.press("Escape");
});

test("exit check: a User creates a persona and makes it Official (no approvals, D-043)", async () => {
  await rep.goto("/personas?tab=personal");
  await rep.getByRole("button", { name: "Add persona" }).click();
  const dialog = rep.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Agency Operations Leads");
  await dialog.getByText("Leadership", { exact: true }).click();
  await dialog.getByPlaceholder("Add another function…").fill("Operations");
  await dialog.getByPlaceholder("Add another function…").press("Enter");
  await dialog.getByLabel("Lead-with angle").fill("Run fieldwork without a research team");
  await dialog.getByRole("button", { name: "Create persona" }).click();
  await expect(card(rep, "Agency Operations Leads")).toContainText("Leadership, Operations");

  await cardAction(rep, "Agency Operations Leads", "Make Official");
  await confirm(rep, "Make Official");
  await expect(shown(rep.getByText("It's Official now: the whole team can use it."))).toBeVisible();
});

test("exit check: the persona is Official straight away; its creator can still edit it", async () => {
  await rep.goto("/personas");
  const official = card(rep, "Agency Operations Leads");
  await expect(official).toBeVisible();
  await official.getByRole("button", { name: "Actions for Agency Operations Leads" }).click();
  await expect(rep.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await rep.keyboard.press("Escape");
});

test("a User adds an Official template directly; there's no Approvals page", async () => {
  await rep.goto("/templates");
  await rep.getByRole("button", { name: "Add template" }).click();
  const dialog = rep.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New Official template" })).toBeVisible();
  await dialog.getByLabel("Name").fill("Follow-up 1 – short");
  await dialog.getByLabel("Purpose").selectOption("Follow-up 1");
  await dialog
    .getByLabel("Message")
    .fill("{Name}, worth a 20-minute look at a study like {Company}'s?");
  await dialog.getByRole("button", { name: "Create template" }).click();
  await expect(card(rep, "Follow-up 1 – short")).toBeVisible();
  await expect(admin.getByRole("link", { name: /Approvals/ })).toHaveCount(0);
  await admin.goto("/approvals");
  await expect(admin).toHaveURL(/\/plans$/);
});

test("account filter codes: no second Official A1; copies get -copy", async () => {
  await admin.goto("/account-filters");
  await admin.getByRole("button", { name: "Add account filter" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Code").fill("A1");
  await dialog.getByLabel("Name").fill("Another A1");
  await dialog.getByRole("button", { name: "Create account filter" }).click();
  await expect(shown(dialog.getByText(/already uses the code A1/))).toBeVisible();
  await admin.keyboard.press("Escape");

  await rep.goto("/account-filters");
  await cardAction(rep, "A2 Ad & Creative Agencies", "Duplicate to my Personal");
  await rep.goto("/account-filters?tab=personal");
  await expect(card(rep, "A2-copy Copy of Ad & Creative Agencies")).toBeVisible();
});

test("editing a template's wording keeps the earlier wording", async () => {
  await admin.goto("/templates");
  await cardAction(admin, "Reply – not now", "Edit");
  const dialog = admin.getByRole("dialog");
  await dialog
    .getByLabel("Message")
    .fill("Understood. When does {Company} usually plan research for the next quarter?");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(card(admin, "Reply – not now")).toContainText("Revision 2");
  await cardAction(admin, "Reply – not now", "Earlier wordings");
  await expect(
    shown(admin.getByRole("dialog").getByText(/When does research planning usually happen/)),
  ).toBeVisible();
});
