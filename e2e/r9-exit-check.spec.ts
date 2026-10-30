// The R9 exit check from the PRD, automated: generate a personal report and a team report for a
// custom range, open the print layout and download the CSV; an Admin adds a schedule and runs it
// now, and it shows in Report history. (Emailing is checked by the unit tests: the browser tests
// run without an email key, so scheduled reports are saved but not sent.)
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Zara Rep", email: "zara@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
let teamReportUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const FROM = `${today.slice(0, 4)}-01-01`;

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

async function customReport(page: Page, who: string) {
  await page.goto("/reports");
  const form = shown(page.getByRole("form", { name: "Make a report" }));
  await form.getByLabel("Who").selectOption({ label: who });
  await form.getByLabel("Period").selectOption("custom");
  await form.getByLabel("From").fill(FROM);
  await form.getByLabel("To").fill(today);
  await form.getByRole("button", { name: "Generate" }).click();
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
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

  // Something to report: the rep adds a lead and logs a message to them.
  await rep.goto("/people");
  await rep.getByRole("button", { name: "Add person" }).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Full name").fill("Omar Report");
  await d.getByLabel("LinkedIn profile link").fill("linkedin.com/in/omar-report-r9");
  await d.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await d.getByLabel("New company name").fill("E2E Co");
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const conversation = shown(rep.getByRole("region", { name: "Conversation" }));
  await conversation
    .getByLabel("What you sent or said")
    .fill("Hi Omar, quick question on research.");
  await conversation.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(rep.getByText("Added to the conversation."))).toBeVisible();
});

test("exit check: a rep makes a personal report for a custom range; it's saved", async () => {
  await rep.goto("/reports");
  // Users can only report on themselves.
  const who = shown(rep.getByRole("form", { name: "Make a report" })).getByLabel("Who");
  await expect(who.locator("option")).toHaveText(["Me"]);

  await customReport(rep, "Me");
  await expect(shown(rep.getByRole("heading", { level: 1 }))).toHaveText(/^Zara Rep · /);
  const activity = shown(rep.getByRole("region", { name: "Activity", exact: true }));
  await expect(activity.getByRole("row", { name: /Zara Rep/ })).toContainText("1");
  await rep.goto("/reports");
  await expect(
    shown(rep.getByRole("region", { name: "Report history" })).getByRole("link", {
      name: /^Zara Rep · /,
    }),
  ).toBeVisible();
});

test("exit check: an Admin makes a team report; the print layout and the CSV work", async () => {
  await customReport(admin, "Whole team");
  teamReportUrl = new URL(admin.url()).pathname;
  await expect(shown(admin.getByRole("heading", { level: 1 }))).toHaveText(/^Team · /);
  const activity = shown(admin.getByRole("region", { name: "Activity", exact: true }));
  await expect(activity.getByRole("row", { name: /Zara Rep/ })).toBeVisible();
  await expect(activity.getByRole("row", { name: /Total/ })).toBeVisible();
  await expect(shown(admin.getByRole("region", { name: "Funnel" }))).toContainText(
    "Contacted → Connected",
  );

  // Download PDF opens the browser's print dialog, over a layout without the sidebar or buttons.
  await admin.evaluate(() => {
    (window as unknown as { printed: boolean }).printed = false;
    window.print = () => {
      (window as unknown as { printed: boolean }).printed = true;
    };
  });
  await admin.getByRole("button", { name: "Download PDF" }).click();
  expect(await admin.evaluate(() => (window as unknown as { printed: boolean }).printed)).toBe(
    true,
  );
  await admin.emulateMedia({ media: "print" });
  await expect(admin.getByRole("link", { name: "Dashboard" })).toBeHidden();
  await expect(admin.getByRole("button", { name: "Download PDF" })).toBeHidden();
  await admin.screenshot({ path: "test-results/r9-print.png", fullPage: true });
  await admin.emulateMedia({ media: "screen" });

  const download = admin.waitForEvent("download");
  await admin.getByRole("link", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`lumor-report-${FROM}-to-${today}.csv`);
  const csv = await (await file.createReadStream()).toArray();
  expect(Buffer.concat(csv).toString("utf8")).toContain("Activity, outcomes and plan adherence");
});

test("a rep can't open someone else's report", async () => {
  await rep.goto(teamReportUrl);
  await expect(shown(rep.getByText("Page not found"))).toBeVisible();
});

test("exit check: an Admin adds a schedule and runs it now; it's in Report history", async () => {
  await admin.goto("/reports");
  const schedules = shown(admin.getByRole("region", { name: "Scheduled reports" }));
  // The three defaults from the PRD.
  for (const name of ["Daily team report", "Weekly team report", "Daily personal summary"])
    await expect(schedules.getByRole("row", { name })).toBeVisible();
  await expect(schedules).toContainText("Email isn’t set up here");

  await schedules.getByRole("button", { name: "Add schedule" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Friday wrap-up");
  await dialog.getByLabel("Day").selectOption({ label: "Friday" });
  await dialog.getByLabel("Time (IST)").selectOption("17:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(shown(admin.getByText("Friday wrap-up saved."))).toBeVisible();
  const row = schedules.getByRole("row", { name: "Friday wrap-up" });
  await expect(row).toContainText("Weekly, Friday, 17:30");

  await row.getByRole("button", { name: "Run Friday wrap-up now" }).click();
  await expect(shown(admin.getByText("1 report made. See Report history."))).toBeVisible();
  await admin.reload();
  const history = shown(admin.getByRole("region", { name: "Report history" }));
  await expect(history.getByRole("row").nth(1)).toContainText("Scheduled");
  await admin.screenshot({ path: "test-results/r9-reports.png", fullPage: true });

  // Switching it off.
  await row.getByRole("button", { name: "Switch Friday wrap-up off" }).click();
  await expect(shown(admin.getByText("Friday wrap-up switched off."))).toBeVisible();
  await expect(schedules.getByRole("row", { name: /Friday wrap-up/ })).toContainText("Off");
});
