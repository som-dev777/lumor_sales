// The R5 exit check, automated: an Admin edits Product Facts and Playbook Settings; everyone
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

test("an Admin fills in Product Facts; a User reads them but can't edit", async () => {
  await admin.goto("/settings/product-facts");
  await expect(shown(admin.getByText(/Not filled in yet/))).toBeVisible();
  await admin.getByRole("button", { name: "Edit" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("What Lumor does").fill("An AI research assistant for insight teams.");
  await d.getByLabel("Live features").fill("Survey analysis\nInterview summaries");
  await d.getByLabel("Calendar link").fill("cal.com/lumor");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d.getByText("Use a full link starting with https://")).toBeVisible();
  await d.getByLabel("Calendar link").fill("https://cal.com/lumor/demo");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();
  await expect(shown(admin.getByText(/Not filled in yet/))).toBeHidden();
  await expect(shown(admin.getByText(/Last edited by Somnath/))).toBeVisible();

  await rep.goto("/settings/product-facts");
  await expect(shown(rep.getByText("An AI research assistant for insight teams."))).toBeVisible();
  await expect(shown(rep.getByRole("link", { name: "https://cal.com/lumor/demo" }))).toBeVisible();
  await expect(shown(rep.getByRole("button", { name: "Edit" }))).toHaveCount(0);
  await expect(shown(rep.getByRole("heading", { name: "Change history" }))).toBeVisible();
  await rep.screenshot({ path: "test-results/r5-facts.png", fullPage: true });
  await expect(shown(rep.getByText("Live features", { exact: true }).last())).toBeVisible();
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
