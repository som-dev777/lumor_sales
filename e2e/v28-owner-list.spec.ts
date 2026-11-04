// v2.8.0 exit check (D-054): company offices with mixed owners (F28) and the owner-change
// notification; Remove on Today with a confirmation; Add company after Fill with AI shows why a
// save is refused next to the button; Ask AI about this company. AI runs in fake mode.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const GUS = { name: "Gus Grant", email: "gus@lumor.tech", password: "rep-password-28" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let gus: Page;

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const todayIst = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");

  gus = await newPage(browser);
  await gus.goto("/signup");
  await shown(gus.getByLabel("Full name")).fill(GUS.name);
  await shown(gus.getByLabel("Work email")).fill(GUS.email);
  await shown(gus.getByLabel("Password", { exact: true })).fill(GUS.password);
  await shown(gus.getByLabel("Confirm password")).fill(GUS.password);
  await gus.getByRole("button", { name: "Create account" }).click();
  await expect(gus).toHaveURL("/");
});

let companyUrl = "";

test("exit check: Fill with AI, then Ask AI about the company, then Add company", async () => {
  await admin.goto("/companies");
  await shown(admin.getByRole("button", { name: "Add company" })).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Company name").fill("Orbit Insights");
  await dialog.getByRole("button", { name: "Fill with AI" }).click();
  await expect(dialog.getByText(/Filled \d+ fields/)).toBeVisible();
  // The chat opens by itself after Fill with AI.
  const chat = dialog.getByRole("region", { name: "Ask AI about this company" });
  await chat.getByLabel("Your question").fill("Where are their offices?");
  await chat.getByLabel("Your question").press("Enter");
  const answers = chat.getByRole("log", { name: "Answers about this company" });
  await expect(answers).toContainText("Orbit Insights runs consumer research panels");
  await chat.getByRole("button", { name: "Add to notes" }).click();
  await expect(dialog.getByLabel("Notes")).toHaveValue(
    /A stand-in answer to: Where are their offices\?/,
  );
  await admin.screenshot({ path: "test-results/v28-company-chat.png", fullPage: true });
  await dialog.getByRole("button", { name: "Add company" }).click();
  await expect(admin).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
  companyUrl = new URL(admin.url()).pathname;
});

test("exit check: adding the same company again says why, next to the button", async () => {
  await admin.goto("/companies");
  await shown(admin.getByRole("button", { name: "Add company" })).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Company name").fill("orbit insights");
  await dialog.getByRole("button", { name: "Fill with AI" }).click();
  await expect(dialog.getByText(/Filled \d+ fields/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add company" }).click();
  const problem = dialog.getByRole("alert").filter({ hasText: "Orbit Insights already exists." });
  await expect(problem).toBeVisible();
  await expect(problem).toBeInViewport();
  await expect(problem.getByRole("link", { name: "Open it" })).toBeVisible();
  await admin.keyboard.press("Escape");
});

test("exit check: offices by different reps, a person at one, and the owner told of a change", async () => {
  // Somnath adds the main office in the UK.
  await admin.goto(companyUrl);
  await shown(admin.getByRole("button", { name: "Add office" })).click();
  let dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Office name").fill("Corporate office");
  await dialog.getByLabel("City").fill("London");
  await dialog.getByLabel("Country").fill("United Kingdom");
  await dialog.getByLabel("Main (corporate) office").check();
  await dialog.getByRole("button", { name: "Add office" }).click();
  await expect(shown(admin.getByText("Corporate office added."))).toBeVisible();

  // Gus adds the Bangalore office, and a person who works there.
  await gus.goto(companyUrl);
  await shown(gus.getByRole("button", { name: "Add office" })).click();
  dialog = gus.getByRole("dialog");
  await dialog.getByLabel("Office name").fill("Bangalore office");
  await dialog.getByLabel("City").fill("Bangalore");
  await dialog.getByLabel("Country").fill("India");
  await dialog.getByRole("button", { name: "Add office" }).click();
  await expect(shown(gus.getByText("Bangalore office added."))).toBeVisible();
  await shown(gus.getByRole("button", { name: "Add person" })).click();
  dialog = gus.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Olga Orbit");
  await dialog.getByLabel("LinkedIn profile link").fill("linkedin.com/in/olga-orbit-v28");
  await dialog.getByLabel("Office (optional)").selectOption({ label: "Bangalore office" });
  await dialog.getByLabel("Next action", { exact: true }).fill("Send the panel deck");
  await dialog.getByLabel("Next action date").fill(todayIst());
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(gus).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const facts = gus.locator("dl").first();
  await expect(facts).toContainText("Bangalore office");
  await expect(facts).toContainText("Gus Grant");

  // The company page lists both offices with owner and who added each.
  await admin.goto(companyUrl);
  const offices = shown(admin.getByRole("region", { name: "Offices" }));
  const main = offices.getByRole("listitem", { name: "Office Corporate office" });
  await expect(main).toContainText("Main office");
  await expect(main).toContainText("Owner: Somnath · Added by Somnath");
  const blr = offices.getByRole("listitem", { name: "Office Bangalore office" });
  await expect(blr).toContainText("Owner: Gus Grant · Added by Gus Grant");
  await expect(blr).toContainText("1 person");
  await admin.screenshot({ path: "test-results/v28-offices.png", fullPage: true });

  // Somnath (Admin) gives the Bangalore office to himself: Gus is told.
  await blr.getByRole("button", { name: "Edit the office Bangalore office" }).click();
  dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Owner").selectOption({ label: "Somnath" });
  await dialog.getByRole("button", { name: "Save office" }).click();
  await expect(shown(admin.getByText("Bangalore office saved."))).toBeVisible();
  await gus.goto("/");
  await shown(gus.getByRole("button", { name: /Notifications, \d+ new/ })).click();
  await expect(
    gus.getByText("New owner for the office Orbit Insights · Bangalore office"),
  ).toBeVisible();
  await gus.keyboard.press("Escape");
});

test("exit check: Remove a follow-up on Today, after a confirmation", async () => {
  await gus.goto("/");
  const task = shown(gus.getByRole("listitem", { name: "Olga Orbit" }));
  await expect(task).toContainText("Send the panel deck");
  await task.getByRole("button", { name: "Remove the follow-up for Olga Orbit" }).click();
  const confirm = gus.getByRole("dialog", { name: "Remove the follow-up for Olga Orbit?" });
  await expect(confirm).toBeVisible();
  // "Keep it" leaves it alone.
  await confirm.getByRole("button", { name: "Keep it" }).click();
  await expect(task).toBeVisible();
  await task.getByRole("button", { name: "Remove the follow-up for Olga Orbit" }).click();
  await gus
    .getByRole("dialog", { name: "Remove the follow-up for Olga Orbit?" })
    .getByRole("button", { name: "Remove follow-up" })
    .click();
  await expect(shown(gus.getByText("Follow-up for Olga Orbit removed."))).toBeVisible();
  await expect(gus.getByRole("listitem", { name: "Olga Orbit" })).toHaveCount(0);
  await gus.reload();
  await expect(gus.getByRole("listitem", { name: "Olga Orbit" })).toHaveCount(0);
});
