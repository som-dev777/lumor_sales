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
  await expect(card(rep, "Product & Design").getByLabel(/only Admins can change it/)).toBeVisible();
  await card(rep, "Product & Design")
    .getByRole("button", { name: "Actions for Product & Design" })
    .click();
  await expect(rep.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await expect(rep.getByRole("menuitem", { name: "Duplicate to my Personal" })).toBeVisible();
  await rep.keyboard.press("Escape");
});

test("exit check: a User creates a persona and proposes it", async () => {
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

  await cardAction(rep, "Agency Operations Leads", "Propose as Official");
  await confirm(rep, "Propose");
  await expect(shown(rep.getByText("Waiting for an Admin"))).toBeVisible();
  await expect(
    card(rep, "Agency Operations Leads").getByText("Proposed", { exact: true }),
  ).toBeVisible();
});

test("a User also proposes a template", async () => {
  await rep.goto("/templates?tab=personal");
  await rep.getByRole("button", { name: "Add template" }).click();
  const dialog = rep.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Follow-up 1 – short");
  await dialog.getByLabel("Purpose").selectOption("Follow-up 1");
  await dialog
    .getByLabel("Message")
    .fill("{Name}, worth a 20-minute look at a study like {Company}'s?");
  await dialog.getByRole("button", { name: "Create template" }).click();
  await cardAction(rep, "Follow-up 1 – short", "Propose as Official");
  await confirm(rep, "Propose");
  await expect(
    card(rep, "Follow-up 1 – short").getByText("Proposed", { exact: true }),
  ).toBeVisible();
});

test("Admins see how many proposals are waiting; Users can't open Approvals", async () => {
  await admin.goto("/personas");
  // 2 library proposals + the 3 draft seed plans waiting for approval (R7).
  await expect(
    admin.getByRole("link", { name: /Approvals/ }).getByLabel("5 waiting"),
  ).toBeVisible();
  await rep.goto("/approvals");
  await expect(shown(rep.getByText("Not allowed", { exact: true }))).toBeVisible();
});

test("exit check: an Admin approves the persona", async () => {
  await admin.goto("/approvals");
  const item = admin.getByRole("listitem", { name: "Agency Operations Leads" });
  await expect(item).toContainText("Proposed by Ravi Rep");
  await expect(item).toContainText("Run fieldwork without a research team");
  await item.getByRole("button", { name: "Approve" }).click();
  await confirm(admin, "Approve");
  await expect(shown(admin.getByText(/is now Official/))).toBeVisible();
  await expect(admin.getByRole("listitem", { name: "Agency Operations Leads" })).toHaveCount(0);
});

test("exit check: the persona is now Official and locked for the User", async () => {
  await rep.goto("/personas");
  const approved = card(rep, "Agency Operations Leads");
  await expect(approved).toBeVisible();
  await expect(approved.getByLabel(/only Admins can change it/)).toBeVisible();
  await expect(approved.getByText("Approved", { exact: true })).toBeVisible();
  await approved.getByRole("button", { name: "Actions for Agency Operations Leads" }).click();
  await expect(rep.getByRole("menuitem", { name: "Edit" })).toHaveCount(0);
  await rep.keyboard.press("Escape");
  await expect(shown(rep.getByText("Approved", { exact: true }))).toBeVisible();
});

test("an Admin rejects the template with a note; the User sees it", async () => {
  await admin.goto("/approvals");
  const item = admin.getByRole("listitem", { name: "Follow-up 1 – short" });
  await item.getByRole("button", { name: "Reject" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog
    .getByLabel("Note for the proposer (optional)")
    .fill("Please add the {video} link like the Official one.");
  await dialog.getByRole("button", { name: "Reject" }).click();
  await expect(admin.getByRole("dialog")).toBeHidden();
  await expect(admin.getByRole("heading", { name: "Recently decided" })).toBeVisible();
  await expect(
    shown(admin.getByText("Please add the {video} link like the Official one.", { exact: false })),
  ).toBeVisible();

  await rep.goto("/templates?tab=personal");
  const rejected = card(rep, "Follow-up 1 – short");
  await expect(rejected.getByText("Proposal rejected")).toBeVisible();
  await expect(rejected).toContainText("Please add the {video} link like the Official one.");
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
