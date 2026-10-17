// The R3 exit check from the PRD, automated: adding the same person through five URL variants
// and a Sales Navigator link creates exactly one record. Plus the rest of People and Companies.
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Meera Rep", email: "meera@lumor.tech", password: "rep-password-12" };
const OTHER = { name: "Kabir Rep", email: "kabir@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
let other: Page;
let personUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  return (
    await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
  ).newPage();
}

async function signUp(page: Page, who: typeof REP) {
  await page.goto("/signup");
  await shown(page.getByLabel("Full name")).fill(who.name);
  await shown(page.getByLabel("Work email")).fill(who.email);
  await shown(page.getByLabel("Password", { exact: true })).fill(who.password);
  await shown(page.getByLabel("Confirm password")).fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
}

async function openAddPerson(page: Page) {
  await page.goto("/people");
  await page.getByRole("button", { name: "Add person" }).click();
  return page.getByRole("dialog");
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");
  rep = await newPage(browser);
  await signUp(rep, REP);
  other = await newPage(browser);
  await signUp(other, OTHER);
});

test("a User adds a person; a new company is created from the name", async () => {
  const dialog = await openAddPerson(rep);
  await dialog.getByLabel("Full name").fill("Priya Sharma");
  await dialog.getByLabel("Title").fill("Head of Research");
  await dialog
    .getByLabel("LinkedIn profile link")
    .fill("https://www.LinkedIn.com/in/Priya-S/?utm_source=x");
  await dialog.getByLabel("Company").fill("Acme Insights");
  await dialog.getByLabel("Persona").selectOption({ label: "Research & Insights" });
  await dialog.getByLabel("Next action", { exact: true }).fill("Send connection request");
  await dialog.getByLabel("Next action date").fill("2026-01-05");
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(rep.url()).pathname;
  await expect(rep.getByRole("heading", { name: "Priya Sharma" })).toBeVisible();
  await expect(rep.getByRole("link", { name: "Acme Insights" })).toBeVisible();
  await expect(rep.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("target", "_blank");
});

test("exit check: five URL variants and a Sales Navigator link are all refused", async () => {
  const variants = [
    "http://linkedin.com/in/priya-s",
    "linkedin.com/in/PRIYA-S?utm_medium=member_desktop",
    "https://m.linkedin.com/in/priya-s/#experience",
    "https://in.linkedin.com/in/priya-s/",
    "www.linkedin.com/in/priya-s/details/experience/",
  ];
  for (const url of variants) {
    const dialog = await openAddPerson(other);
    await dialog.getByLabel("Full name").fill("Priya S");
    await dialog.getByLabel("LinkedIn profile link").fill(url);
    await dialog.getByRole("button", { name: "Add person" }).click();
    await expect(shown(dialog.getByText("Already added by Meera Rep."))).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Open the existing person" })).toHaveAttribute(
      "href",
      personUrl,
    );
    await other.keyboard.press("Escape");
  }
  const dialog = await openAddPerson(other);
  await dialog.getByLabel("Full name").fill("Priya S");
  await dialog
    .getByLabel("LinkedIn profile link")
    .fill("https://www.linkedin.com/sales/lead/ACwAAA123,NAME_SEARCH");
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(
    shown(dialog.getByText("Paste the public profile link (linkedin.com/in/…)")),
  ).toBeVisible();
  await other.keyboard.press("Escape");
});

test("exit check: exactly one Priya exists", async () => {
  await admin.goto("/people?view=all&q=priya");
  await expect(shown(admin.getByText("1 lead", { exact: true }))).toBeVisible();
  await expect(admin.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
});

test("another User sees 'claimed by', can't edit, but can add a note", async () => {
  await other.goto(personUrl);
  await expect(
    shown(other.getByText("This lead is claimed by Meera Rep. You can add notes.")),
  ).toBeVisible();
  await expect(other.getByRole("button", { name: "Edit" })).toHaveCount(0);
  await other
    .getByRole("textbox", { name: "Add a note" })
    .fill("Met Priya at the insights meetup.");
  await other.getByRole("button", { name: "Add note" }).click();
  await expect(shown(other.getByText("Met Priya at the insights meetup."))).toBeVisible();
});

test("Lost needs a reason; a manual stage change appears on the timeline", async () => {
  await rep.goto(personUrl);
  await rep.getByRole("button", { name: "Edit" }).click();
  const dialog = rep.getByRole("dialog");
  await dialog.getByLabel("Stage").selectOption("Lost");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(shown(dialog.getByText("Choose why this lead was lost."))).toBeVisible();
  await dialog.getByLabel("Lost reason").selectOption("Not a priority");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(rep.getByRole("dialog")).toBeHidden();
  await expect(shown(rep.getByText("Prospect → Lost (Not a priority)"))).toBeVisible();
  // Back to Connected for the rest of the journey
  await rep.getByRole("button", { name: "Edit" }).click();
  await rep.getByRole("dialog").getByLabel("Stage").selectOption("Connected");
  await rep.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await expect(rep.getByRole("dialog")).toBeHidden();
});

test("filters: My leads by default for Users; Overdue finds the old next action", async () => {
  await rep.goto("/people");
  await expect(rep.getByRole("link", { name: "My leads" })).toHaveAttribute("aria-current", "page");
  await rep.goto("/people?view=mine&next=overdue");
  await expect(rep.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  await other.goto("/people?view=mine");
  await expect(shown(other.getByText("You don't have any leads yet"))).toBeVisible();
});

test("an Admin bulk-reassigns leads", async () => {
  const dialog = await openAddPerson(rep);
  await dialog.getByLabel("Full name").fill("Arjun Mehta");
  await dialog.getByLabel("LinkedIn profile link").fill("https://www.linkedin.com/in/arjun-mehta/");
  await dialog.getByLabel("Company").fill("acme insights");
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  await admin.goto("/people?view=all");
  await shown(admin.getByLabel("Select Priya Sharma")).check();
  await shown(admin.getByLabel("Select Arjun Mehta")).check();
  await shown(admin.getByLabel("New owner")).selectOption({ label: OTHER.name });
  await admin.getByRole("button", { name: "Reassign owner" }).click();
  await expect(shown(admin.getByText("2 leads reassigned."))).toBeVisible();
  await other.goto("/people?view=mine");
  await expect(shown(other.getByText("2 leads", { exact: true }))).toBeVisible();
});

test("CSV export downloads the filtered view", async () => {
  await admin.goto("/people?view=all");
  const [download] = await Promise.all([
    admin.waitForEvent("download"),
    admin.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  const lines = readFileSync(await download.path(), "utf8")
    .trim()
    .split(/\r\n/);
  expect(lines[0]).toContain("Name,Title,Company,LinkedIn");
  expect(lines).toHaveLength(3);
});

test("companies: the typed name linked both people; mark as customer records the deal", async () => {
  await admin.goto("/companies");
  await expect(admin.getByRole("link", { name: "Acme Insights" })).toBeVisible();
  await admin.getByRole("link", { name: "Acme Insights" }).click();
  const people = admin.getByRole("region", { name: "People" });
  await expect(people.getByRole("link", { name: "Priya Sharma" })).toBeVisible();
  await expect(people.getByRole("link", { name: "Arjun Mehta" })).toBeVisible();
  await expect(shown(admin.getByText("Met Priya at the insights meetup."))).toBeVisible();

  await admin.getByRole("button", { name: "Mark as customer" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Plan or tier").fill("Team");
  await dialog.getByLabel("Deal value (₹)").fill("240000");
  await dialog.getByRole("button", { name: "Mark as customer" }).click();
  await expect(admin.getByRole("dialog")).toBeHidden();
  await expect(admin.getByRole("region", { name: "Deal" })).toContainText("₹2,40,000");
  await expect(admin.getByRole("region", { name: "Acme Insights" })).toContainText("Customer");
});

test("People works on a phone without sideways scrolling", async ({ browser }) => {
  const phone = await (
    await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  ).newPage();
  await phone.goto("/login");
  await shown(phone.getByLabel("Email")).fill(ADMIN.email);
  await shown(phone.getByLabel("Password")).fill(ADMIN.password);
  await phone.getByRole("button", { name: "Log in" }).click();
  await expect(phone).toHaveURL("/");
  await phone.goto("/people?view=all");
  await expect(phone.getByRole("table")).toBeVisible();
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
