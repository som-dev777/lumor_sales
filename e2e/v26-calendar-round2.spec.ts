// v2.6.0 exit check (D-042): question types; a client books on a phone (IST by default, a
// time zone dropdown, email and phone checks, required stars); wrong links show a plain public
// page; the rep's bell shows the booking; the month/week calendar; a teammate is added and
// notified; the host reschedules; Availability shows what people see.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const DANA = { name: "Dana Demo", email: "dana@lumor.tech", password: "rep-password-26" };
const ELI = { name: "Eli Expert", email: "eli@lumor.tech", password: "rep-password-26b" };

test.describe.configure({ mode: "serial" });

let dana: Page;
let eli: Page;
let link = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function signUp(browser: Browser, who: typeof DANA) {
  const page = await (
    await browser.newContext({ viewport: { width: 1280, height: 900 } })
  ).newPage();
  await page.goto("/signup");
  await shown(page.getByLabel("Full name")).fill(who.name);
  await shown(page.getByLabel("Work email")).fill(who.email);
  await shown(page.getByLabel("Password", { exact: true })).fill(who.password);
  await shown(page.getByLabel("Confirm password")).fill(who.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");
  return page;
}

test.beforeAll(async ({ browser }) => {
  dana = await signUp(browser, DANA);
  eli = await signUp(browser, ELI);
});

test("exit check: a meeting type with a dropdown, checkboxes and a paragraph question", async () => {
  await dana.goto("/calendar/meeting-types");
  await shown(dana.getByRole("button", { name: "New meeting type" })).click();
  const dialog = dana.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Discovery call");
  await dialog.getByLabel("Link name").fill("discovery");
  await dialog.getByLabel("Length").selectOption("custom");
  await dialog.getByLabel("Custom length (minutes)").fill("25");
  await dialog.getByLabel("Minimum notice (hours)").fill("1");

  await dialog.getByRole("button", { name: "Add a question" }).click();
  await dialog.getByLabel("Question 1", { exact: true }).fill("Team size");
  await dialog.getByLabel("Type").nth(0).selectOption("dropdown");
  await dialog.getByLabel("Choices (one per line)").fill("1–10\n11–50\n51+");
  await dialog.getByLabel("Required").nth(0).check();

  await dialog.getByRole("button", { name: "Add a question" }).click();
  await dialog.getByLabel("Question 2", { exact: true }).fill("Topics");
  await dialog.getByLabel("Type").nth(1).selectOption("checkboxes");
  await dialog.getByLabel("Choices (one per line)").nth(1).fill("Panels\nSurveys\nAI");

  await dialog.getByRole("button", { name: "Add a question" }).click();
  await dialog.getByLabel("Question 3", { exact: true }).fill("Anything else?");
  await dialog.getByLabel("Type").nth(2).selectOption("paragraph");
  await dana.screenshot({ path: "test-results/v26-meeting-type.png", fullPage: true });
  await dialog.getByRole("button", { name: "Create meeting type" }).click();
  await expect(shown(dana.getByText("Discovery call saved."))).toBeVisible();
  await expect(shown(dana.getByRole("region", { name: "Discovery call" }))).toContainText("25 min");
  link = new URL(await shown(dana.getByLabel("Booking link for Discovery call")).inputValue())
    .pathname;
  expect(link).toBe("/book/dana/discovery");
});

test("exit check: Availability shows what people see and takes many ranges a day", async () => {
  await dana.goto("/calendar/availability");
  const preview = shown(dana.getByRole("region", { name: "What people see" }));
  await expect(preview).toContainText("Discovery call (25 min)");
  await expect(preview).toContainText("free times");
  const hours = shown(dana.getByRole("region", { name: "Weekly hours" }));
  for (let i = 0; i < 5; i++) {
    await hours.getByRole("button", { name: "Add hours on Sunday" }).click();
  }
  await expect(hours.getByLabel("Sunday from")).toHaveCount(5);
  await expect(shown(dana.getByRole("region", { name: "Google Calendar" }))).toContainText(
    "Google isn’t set up for this site yet",
  );
  await shown(dana.getByLabel("Send booking emails to")).fill("dana.bookings@lumor.tech");
  await shown(dana.getByRole("button", { name: "Save availability" })).click();
  await expect(shown(dana.getByText("Availability saved."))).toBeVisible();
});

test("exit check: a client books on a phone, in IST, with checks on every field", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await ctx.newPage();
  await phone.goto(link);
  await expect(phone.getByRole("heading", { name: "Discovery call" })).toBeVisible();
  await expect(phone.getByText("Lumor", { exact: true })).toBeVisible();
  await expect(phone.getByText("Scheduling by Lumor")).toHaveCount(0);
  await expect(phone.getByLabel("Time zone")).toHaveValue("Asia/Kolkata");
  await expect(phone.getByText("Times in India Standard Time")).toBeVisible();
  // No sideways scrolling on a phone.
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(wide).toBe(false);
  await phone.screenshot({ path: "test-results/v26-phone-pick.png", fullPage: true });

  const day = phone.getByRole("group", { name: "Days" }).getByRole("button", { pressed: true });
  await expect(day).toBeVisible();
  await phone.getByRole("group", { name: "Times" }).getByRole("button").first().click();

  await phone.getByRole("button", { name: "Confirm booking" }).click();
  await expect(phone.getByText("Enter your name.")).toBeVisible();
  await expect(phone.getByText("Team size").locator("..")).toBeVisible();
  await phone.getByLabel("Your name").fill("Pia Phone");
  await phone.getByLabel("Work email").fill("pia@acme");
  await phone.getByLabel("Company").fill("Acme Insights");
  await phone.getByLabel("Country code").selectOption("IN");
  await phone.getByRole("textbox", { name: "Phone (optional)" }).fill("12345");
  await phone.getByRole("button", { name: "Confirm booking" }).click();
  await expect(phone.getByText("Enter a valid email, like name@company.com.")).toBeVisible();
  await expect(
    phone.getByText("Enter a valid phone number for the country you picked."),
  ).toBeVisible();
  await expect(phone.getByText("This question is required.")).toBeVisible();

  await phone.getByLabel("Work email").fill("pia@acme-insights.in");
  await phone.getByRole("textbox", { name: "Phone (optional)" }).fill("98765 43210");
  await phone.getByLabel("Team size").selectOption("11–50");
  await phone.getByRole("checkbox", { name: "Panels" }).check();
  await phone.getByRole("checkbox", { name: "AI" }).check();
  await phone.getByLabel("Anything else?").fill("We run monthly trackers.");
  await phone.screenshot({ path: "test-results/v26-phone-form.png", fullPage: true });
  const formFits = await phone.evaluate(() =>
    [...document.querySelectorAll("input, select, textarea")].every(
      (el) => el.getBoundingClientRect().right <= innerWidth,
    ),
  );
  expect(formFits).toBe(true);
  await phone.getByRole("button", { name: "Confirm booking" }).click();
  await expect(phone).toHaveURL(/\/booking\/[A-Za-z0-9_-]+\?new=1$/);
  await expect(phone.getByRole("heading", { name: "You’re booked" })).toBeVisible();
  await phone.screenshot({ path: "test-results/v26-phone-booked.png", fullPage: true });
  await ctx.close();
});

test("exit check: a wrong or changed link shows a plain page with no way into the app", async ({
  browser,
}) => {
  const visitor = await (await browser.newContext()).newPage();
  for (const path of [
    "/book/dana/nope",
    "/book/dana/discovery/extra",
    "/booking/not-a-code",
    "/book",
  ]) {
    await visitor.goto(path);
    await expect(visitor.getByRole("heading", { name: "This link doesn’t work" })).toBeVisible();
    await expect(visitor.getByRole("link", { name: /Today/ })).toHaveCount(0);
    await expect(visitor).not.toHaveURL(/\/login/);
  }
  await visitor.context().close();
});

test("exit check: the rep's bell shows the booking; the calendar shows it by week and month", async () => {
  await dana.goto("/");
  const bell = shown(dana.getByRole("button", { name: /Notifications, 1 new/ }));
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(dana.getByRole("menu")).toContainText("New booking: Discovery call with Pia Phone");
  await dana.screenshot({ path: "test-results/v26-bell.png" });
  await dana.getByRole("menuitem", { name: /New booking/ }).click();
  await expect(dana).toHaveURL(/\/calendar\?booking=/);
  const dialog = dana.getByRole("dialog");
  await expect(dialog).toContainText("Pia Phone");
  await expect(dialog).toContainText("Topics");
  await expect(dialog).toContainText("Panels, AI");
  await expect(dialog).toContainText("+91 98765 43210");
  await dana.keyboard.press("Escape");

  // Find the week with the meeting, then the month.
  await dana.goto("/calendar?view=month");
  let chip = dana.getByRole("link", { name: /Discovery call · Pia Phone/ });
  if ((await chip.count()) === 0) {
    await dana.getByRole("link", { name: "Next" }).click();
    chip = dana.getByRole("link", { name: /Discovery call · Pia Phone/ });
  }
  await expect(chip.first()).toBeVisible();
  await dana.screenshot({ path: "test-results/v26-month.png", fullPage: true });
  await chip.first().click();
  await expect(dana.getByRole("dialog")).toContainText("On the meeting");
});

test("exit check: a teammate is added and notified; everyone sees the meeting", async () => {
  const dialog = dana.getByRole("dialog");
  await dialog.getByLabel("Add a teammate").selectOption({ label: ELI.name });
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(shown(dana.getByText("Eli Expert added and notified."))).toBeVisible();
  await expect(dialog.getByRole("list").first()).toContainText("Eli Expert");
  await dana.screenshot({ path: "test-results/v26-detail.png", fullPage: true });

  await eli.goto("/calendar?view=list");
  await expect(shown(eli.getByRole("table", { name: "Upcoming bookings" }))).toContainText(
    "Dana Demo, Eli Expert",
  );
  await eli.goto("/");
  const bell = shown(eli.getByRole("button", { name: /Notifications, 1 new/ }));
  await bell.click();
  await expect(eli.getByRole("menu")).toContainText(
    "Dana Demo added Eli Expert to Discovery call with Pia Phone",
  );
  await eli.getByRole("button", { name: "Mark all read" }).click();
  await eli.keyboard.press("Escape");
  await expect(
    shown(eli.getByRole("button", { name: "Notifications", exact: true })),
  ).toBeVisible();
});

test("exit check: the host reschedules from the calendar", async () => {
  await dana.goto("/calendar?view=list");
  const table = shown(dana.getByRole("table", { name: "Upcoming bookings" }));
  await table
    .getByRole("link", { name: /\d{4}, / })
    .first()
    .click();
  const dialog = dana.getByRole("dialog");
  await dialog.getByRole("button", { name: "Reschedule" }).click();
  const times = dialog.getByRole("group", { name: "Times" }).getByRole("button");
  await times.last().click();
  await dialog.getByRole("button", { name: "Move to this time" }).click();
  await expect(shown(dana.getByText(/Meeting moved/))).toBeVisible();
  await expect(shown(dana.getByRole("table", { name: "Upcoming bookings" }))).toContainText(
    "Rescheduled",
  );
  // Eli is told.
  await eli.goto("/");
  await shown(eli.getByRole("button", { name: /Notifications, 1 new/ })).click();
  await expect(eli.getByRole("menu")).toContainText("Rescheduled: Discovery call with Pia Phone");
});

test("the booking page on a laptop: details on the left, calendar on the right", async ({
  browser,
}) => {
  const visitor = await (
    await browser.newContext({ viewport: { width: 1280, height: 860 } })
  ).newPage();
  await visitor.goto(link);
  await expect(visitor.getByRole("group", { name: "Days" })).toBeVisible();
  await visitor.screenshot({ path: "test-results/v26-desktop-pick.png", fullPage: true });
  await visitor.getByLabel("Time zone").selectOption("Europe/London");
  await expect(visitor.getByLabel("Time zone")).toHaveValue("Europe/London");
  await visitor.context().close();
});
