// v2.7.0 exit check (D-043): an event with the standard fields and a required checkbox
// question is booked on a phone (email first, "IN +91", online or in person, no "Required"
// line); the confirmation offers only Reschedule and Cancel; the booking reaches the rep's
// calendar and creates a person to check; the rep schedules a meeting with To and CC; a Custom
// task in a plan; a report emailed to a teammate shows under Shared with me, with a real PDF;
// the Team tab opens the list behind a number.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const FAY = { name: "Fay Field", email: "fay@lumor.tech", password: "rep-password-27" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let fay: Page;
let link = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

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

  fay = await newPage(browser);
  await fay.goto("/signup");
  await shown(fay.getByLabel("Full name")).fill(FAY.name);
  await shown(fay.getByLabel("Work email")).fill(FAY.email);
  await shown(fay.getByLabel("Password", { exact: true })).fill(FAY.password);
  await shown(fay.getByLabel("Confirm password")).fill(FAY.password);
  await fay.getByRole("button", { name: "Create account" }).click();
  await expect(fay).toHaveURL("/");
});

test("exit check: Calendar says Events; a new event lists the standard fields to switch", async () => {
  await fay.goto("/calendar/meeting-types");
  await expect(fay).toHaveURL(/\/calendar\/events$/);
  await expect(shown(fay.getByRole("link", { name: "Events" }))).toBeVisible();
  await shown(fay.getByRole("button", { name: "New event" })).click();
  const dialog = fay.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Lumor demo");
  await dialog.getByLabel("Link code").fill("demo");
  await dialog.getByLabel("Minimum notice (hours)").fill("1");
  await dialog.getByLabel("Name in emails (optional)").fill("Lumor demo");
  await dialog.getByLabel("In person: address (optional)").fill("Lumor, Indiranagar, Bengaluru");
  const fields = dialog.getByRole("table", { name: "Standard fields" });
  await expect(fields).toContainText("Work email");
  await expect(fields.getByLabel("Work email required")).toBeDisabled();
  await expect(fields.getByLabel("Company required")).toBeChecked();
  // Make phone required.
  await fields.getByLabel("Phone required").check();

  await dialog.getByRole("button", { name: "Add a question" }).click();
  await dialog.getByLabel("Question 1", { exact: true }).fill("What kind of research do you run?");
  await dialog.getByLabel("Type").nth(0).selectOption("checkboxes");
  await dialog
    .getByLabel("Choices (one per line)")
    .fill("Surveys and questionnaires\nNPS / customer feedback\nUX research");
  await dialog.getByLabel("Required", { exact: true }).nth(0).check();
  await fay.screenshot({ path: "test-results/v27-event.png", fullPage: true });
  await dialog.getByRole("button", { name: "Create event" }).click();
  await expect(shown(fay.getByText("Lumor demo saved."))).toBeVisible();
  link = new URL(await shown(fay.getByLabel("Booking link for Lumor demo")).inputValue()).pathname;
});

test("exit check: a client books on a phone with a required checkbox question", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await ctx.newPage();
  await phone.goto(link);
  await expect(phone.getByRole("img", { name: "Lumor" }).first()).toBeVisible();
  // Step 1 is the introduction (D-047).
  await expect(phone.getByRole("group", { name: "Times" })).toHaveCount(0);
  await phone.getByRole("button", { name: "Choose a time" }).click();
  await phone.getByRole("group", { name: "Times" }).getByRole("button").first().click();

  // Email comes first; the closed country box shows "IN +91"; no "Required" line.
  const inputs = phone.locator("form input:not([type=hidden])");
  await expect(inputs.first()).toHaveAttribute("type", "email");
  await expect(phone.getByText(/IN \+91/)).toBeVisible();
  await expect(phone.getByText("Required", { exact: true })).toHaveCount(0);
  // Form boxes use 16px text on phones, so iPhones don't zoom in (D-052).
  for (const box of [
    phone.getByLabel("Work email"),
    phone.getByRole("textbox", { name: "Phone" }),
  ]) {
    await expect(box).toHaveCSS("font-size", "16px");
  }

  await phone.getByRole("button", { name: "Confirm booking" }).click();
  await expect(phone.getByText("Enter your phone number.")).toBeVisible();
  await expect(phone.getByText("Choose online or in person.")).toBeVisible();
  await expect(phone.getByText("Pick at least one.")).toBeVisible();

  await phone.getByLabel("Work email").fill("gita@gamma-insights.in");
  await phone.getByLabel("Your name").fill("Gita Gamma");
  await phone.getByLabel("Company").fill("Gamma Insights");
  await phone.getByRole("textbox", { name: "Phone" }).fill("98765 43210");
  await phone.getByRole("radio", { name: /In person/ }).check();
  await expect(phone.getByText("Lumor, Indiranagar, Bengaluru")).toBeVisible();
  await phone.getByRole("checkbox", { name: "Surveys and questionnaires" }).check();
  await phone.getByRole("checkbox", { name: "NPS / customer feedback" }).check();
  await phone.screenshot({ path: "test-results/v27-phone-form.png", fullPage: true });
  await phone.getByRole("button", { name: "Confirm booking" }).click();

  await expect(phone).toHaveURL(/\/booking\/[A-Za-z0-9_-]+\?new=1$/);
  await expect(phone.getByRole("heading", { name: "You’re booked" })).toBeVisible();
  await expect(phone.getByText("In person: Lumor, Indiranagar, Bengaluru")).toBeVisible();
  // Only Reschedule and Cancel.
  await expect(phone.getByRole("button", { name: "Reschedule" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  await expect(
    phone.getByRole("link", { name: /Add to Google Calendar|Calendar file/ }),
  ).toHaveCount(0);
  await phone.screenshot({ path: "test-results/v27-booked.png", fullPage: true });
  await ctx.close();
});

test("exit check: the booking is on Fay's calendar and created a person to check", async () => {
  await fay.goto("/calendar?view=list");
  await expect(shown(fay.getByLabel("Whose meetings"))).toHaveValue(/.+/);
  const table = shown(fay.getByRole("table", { name: "Upcoming bookings" }));
  await expect(table).toContainText("Gita Gamma");
  await table.getByRole("link", { name: "Gita Gamma" }).click();
  await expect(fay).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(shown(fay.getByText(/From the booking page: check details/))).toBeVisible();
  await expect(fay.locator("dl").getByText("Meeting scheduled", { exact: true })).toBeVisible();
  await fay.getByRole("button", { name: "Done checking" }).click();
  await expect(shown(fay.getByText("Marked as checked."))).toBeVisible();
  // The banner and its button are gone (the change history still records the flag).
  await expect(fay.getByRole("button", { name: "Done checking" })).toHaveCount(0);
});

test("exit check: Fay schedules a meeting with To and CC", async () => {
  await fay.goto("/calendar?view=list");
  await shown(fay.getByRole("button", { name: "Schedule a meeting" })).click();
  const dialog = fay.getByRole("dialog");
  await dialog.getByLabel("Title").fill("Lumor walkthrough with Delta");
  const soon = new Date(Date.now() + 3 * 86_400_000);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(soon);
  await dialog.getByLabel("Date").fill(day);
  await dialog.getByLabel("Start time (IST)").fill("16:30");
  await dialog.getByRole("textbox", { name: "To", exact: true }).fill("not-an-email");
  await dialog.getByRole("button", { name: "Schedule and send" }).click();
  await expect(
    shown(dialog.getByText("Enter a valid email, like name@company.com.")),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "To", exact: true })
    .fill("neha@delta.example, ops@delta.example");
  await dialog.getByLabel("CC (optional)").fill("somnath@lumor.tech");
  await dialog.getByLabel("Message (optional)").fill("Bring the tracker deck.");
  await dialog.getByRole("button", { name: "Schedule and send" }).click();
  await expect(
    shown(fay.getByText(/Lumor walkthrough with Delta is on your calendar/)),
  ).toBeVisible();
  const table = shown(fay.getByRole("table", { name: "Upcoming bookings" }));
  await expect(table).toContainText("Lumor walkthrough with Delta");
  await table
    .getByRole("row")
    .filter({ hasText: "Lumor walkthrough with Delta" })
    .getByRole("link", { name: /\d{4}, / })
    .click();
  const detail = fay.getByRole("dialog");
  await expect(detail).toContainText("neha@delta.example, ops@delta.example");
  await expect(detail).toContainText("somnath@lumor.tech");
  await fay.keyboard.press("Escape");
});

test("exit check: a plan step can be a Custom task", async () => {
  await fay.goto("/plans/new");
  await shown(fay.getByLabel("Name")).fill("Pilot follow-through");
  await shown(fay.getByLabel("Plan type")).selectOption("Trial");
  const step1 = shown(fay.getByRole("region", { name: "Step 1" }));
  await step1.getByLabel("Task", { exact: true }).selectOption("Custom");
  await step1.getByLabel("Custom task name").fill("Send a case study");
  await shown(fay.getByRole("button", { name: "Remove step 2" })).click();
  await shown(fay.getByRole("button", { name: "Save plan" })).click();
  await expect(fay).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(shown(fay.getByText("Send a case study"))).toBeVisible();
});

test("exit check: a report emailed to a teammate shows under their Shared with me, as a PDF", async () => {
  await fay.goto("/reports");
  const form = shown(fay.getByRole("form", { name: "Make a report" }));
  await form.getByRole("checkbox", { name: "Somnath", exact: true }).check();
  await form.getByRole("button", { name: "Generate and send" }).click();
  await expect(fay).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  await expect(shown(fay.getByRole("region", { name: "Pipeline" }))).toContainText("People added");

  await admin.goto("/reports?tab=shared");
  const history = shown(admin.getByRole("region", { name: "Report history" }));
  await history
    .getByRole("link", { name: /Fay Field/ })
    .first()
    .click();
  await expect(admin).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  const href = await admin.getByRole("link", { name: "Download PDF" }).getAttribute("href");
  const pdf = await admin.request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
});

test("exit check: the Team tab opens the list behind a number", async () => {
  await admin.goto("/?tab=team");
  const table = shown(admin.getByRole("table", { name: "Team today" }));
  await expect(table.getByRole("columnheader", { name: "Backlog" })).toBeVisible();
  await table.getByRole("link", { name: /^Meetings today for Fay Field/ }).click();
  await expect(admin).toHaveURL(/show=meetings/);
  await expect(
    shown(admin.getByRole("region", { name: /Meetings today: Fay Field/ })),
  ).toBeVisible();
});

test("v2.7.2: Today lists the coming meetings; a guest is added by email from the meeting", async () => {
  await fay.goto("/");
  const meetings = shown(fay.getByRole("region", { name: "Your meetings" }));
  await expect(meetings).toContainText("Lumor walkthrough with Delta");
  await meetings
    .getByRole("link", { name: /Details of the meeting with/ })
    .first()
    .click();
  await expect(fay).toHaveURL(/booking=/);
  const dialog = fay.getByRole("dialog");
  await dialog
    .getByLabel("Add someone to the meeting")
    .selectOption({ label: "Custom: any email address…" });
  await dialog.getByLabel("Their email").fill("cfo@client.example");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(shown(fay.getByText("cfo@client.example added and invited."))).toBeVisible();
  await expect(dialog).toContainText("cfo@client.example");
  await fay.keyboard.press("Escape");
  await expect(fay.getByRole("dialog")).toHaveCount(0);
});

test("v2.7.2: a plan can be deleted; no Archive and no Draft labels", async () => {
  await fay.goto("/plans?tab=mine");
  await shown(fay.getByRole("link", { name: "Pilot follow-through" })).click();
  await expect(fay.getByRole("button", { name: "Archive" })).toHaveCount(0);
  await shown(fay.getByRole("button", { name: "Delete" })).click();
  await fay.getByRole("dialog").getByRole("button", { name: "Delete plan" }).click();
  await expect(fay).toHaveURL(/\/plans$/);
  await expect(fay.getByRole("link", { name: "Pilot follow-through" })).toHaveCount(0);
  await expect(fay.getByText(/\(draft\)/)).toHaveCount(0);
});

test("v2.7.5: events show Online or Offline, go offline and online, and can be deleted", async () => {
  await fay.goto("/calendar/events");
  const card = shown(fay.getByRole("region", { name: "Lumor demo" }));
  await expect(card).toContainText("Online");
  await card.getByRole("button", { name: "Go offline: Lumor demo" }).click();
  await expect(shown(fay.getByRole("region", { name: "Lumor demo" }))).toContainText("Offline");
  await shown(fay.getByRole("button", { name: "Go online: Lumor demo" })).click();
  await expect(shown(fay.getByRole("region", { name: "Lumor demo" }))).toContainText("Online");
  await expect(fay.getByLabel("Gap after (minutes)")).toHaveCount(0);
  await shown(fay.getByRole("button", { name: "Delete Lumor demo" })).click();
  const confirm = fay.getByRole("dialog");
  await expect(confirm).toContainText("can't be undone");
  await confirm.getByRole("button", { name: "Delete event" }).click();
  await expect(fay.getByRole("region", { name: "Lumor demo" })).toHaveCount(0);
  // v2.7.8 (D-051): the page isn't frozen afterwards; other pop-ups still open.
  await expect(fay.getByRole("dialog")).toHaveCount(0);
  await shown(fay.getByRole("button", { name: "New event" })).click();
  await expect(fay.getByRole("dialog", { name: "New event" })).toBeVisible({ timeout: 3000 });
  await fay.keyboard.press("Escape");
});

test("v2.7.8: meetings keep opening, after closing quickly and after a cancel (D-051)", async () => {
  // Page updates are slowed down on purpose below, so this test gets more time.
  test.setTimeout(120_000);
  await fay.goto("/calendar?view=list");
  const open = (who: string) =>
    shown(fay.getByRole("table", { name: "Upcoming bookings" }))
      .getByRole("row")
      .filter({ hasText: who })
      .getByRole("link", { name: /\d{4}, / })
      .click();
  // Close and at once open another meeting, before the page has caught up (slow on the live
  // site, so page updates are slowed down here): it must still open.
  await fay.route("**/calendar?*", async (route) => {
    if (route.request().headers()["rsc"]) await new Promise((ok) => setTimeout(ok, 1500));
    await route.fallback();
  });
  for (let i = 0; i < 2; i++) {
    await open("Lumor walkthrough with Delta");
    await expect(fay.getByRole("dialog")).toContainText("Lumor walkthrough with Delta");
    await fay.keyboard.press("Escape");
    await open("Gita Gamma");
    await expect(fay.getByRole("dialog")).toContainText("Gita Gamma");
    await fay.keyboard.press("Escape");
  }
  await expect(fay.getByRole("dialog")).toHaveCount(0);
  await fay.unrouteAll();
  // Let the slowed page updates finish before the next step.
  await expect(fay).not.toHaveURL(/booking=/, { timeout: 20_000 });
  // Cancel one; the others still open afterwards.
  await open("Gita Gamma");
  await fay
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel booking with Gita Gamma" })
    .click();
  await fay
    .getByRole("dialog", { name: "Cancel booking" })
    .getByRole("button", { name: "Cancel booking" })
    .click();
  await expect(fay.getByRole("dialog")).toHaveCount(1);
  await expect(fay.getByRole("dialog")).toContainText("Cancelled");
  await fay.keyboard.press("Escape");
  await open("Lumor walkthrough with Delta");
  await expect(fay.getByRole("dialog")).toContainText("Lumor walkthrough with Delta");
  await fay.keyboard.press("Escape");
  await expect(fay.getByRole("dialog")).toHaveCount(0);
});
