// The R5 exit check, automated (Product Facts moved to AI Resources in v2.1.0): an Admin edits
// the calendar link and Playbook Settings; everyone
// can read them, only Admins can edit, every change is in the history, and a new follow-up
// delay is used by the next quick-log.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Nisha Rep", email: "nisha@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

/** Today in India plus n days, as the person page shows it (e.g. "20 Oct 2026"). */
function istDatePlus(n: number) {
  const d = new Date(Date.now() + 5.5 * 3_600_000 + n * 86_400_000);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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

test("Product Facts now lives in AI Resources: the calendar link is set there by Admins", async () => {
  await admin.goto("/settings/product-facts");
  await expect(admin).toHaveURL(/\/ai-resources$/);
  const link = shown(admin.getByLabel("Calendar link for demos"));
  await link.fill("http://cal.com/lumor");
  await admin.getByRole("button", { name: "Save link" }).click();
  await expect(shown(admin.getByText("Use a full link starting with https://"))).toBeVisible();
  await link.fill("https://cal.com/lumor/demo");
  await admin.getByRole("button", { name: "Save link" }).click();
  await expect(shown(admin.getByText("Calendar link saved."))).toBeVisible();

  await rep.goto("/ai-resources");
  await expect(shown(rep.getByRole("link", { name: "https://cal.com/lumor/demo" }))).toBeVisible();
  await expect(rep.getByLabel("Calendar link for demos")).toHaveCount(0);
});

test("exit check: a new guardrail value is used by the next quick-log", async () => {
  await admin.goto("/settings/playbook");
  await admin.getByRole("button", { name: "Edit" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel(/Message after accepting: at most/).fill("0");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(shown(d.getByText("Can't be less than the minimum."))).toBeVisible();
  await d.getByLabel(/Message after accepting: at most/).fill("3");
  await d.getByLabel(/Message after accepting: at least/).fill("2");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();

  await rep.goto("/settings/playbook");
  await expect(shown(rep.getByRole("button", { name: "Edit" }))).toHaveCount(0);
  // In the history:
  await expect(shown(rep.getByText("Message after accepting, at least (days)"))).toBeVisible();
  await rep.screenshot({ path: "test-results/r5-playbook.png", fullPage: true });

  await rep.goto("/people");
  await shown(rep.getByRole("button", { name: "Add person" })).click();
  const add = rep.getByRole("dialog");
  await add.getByLabel("Full name").fill("Delay Test");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/delay-test-r5");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await shown(rep.getByRole("button", { name: "Accepted", exact: true })).click();
  await expect(rep.locator("dl").getByText(`Send Message 1 · ${istDatePlus(2)}`)).toBeVisible();
});

test.afterAll(async () => {
  // Put the default back for any later browser tests.
  await admin.goto("/settings/playbook");
  await admin.getByRole("button", { name: "Edit" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel(/Message after accepting: at least/).fill("1");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
});
