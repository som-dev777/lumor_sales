// v2.5.0 exit check (D-041): F22 Calendar (a rep sets hours, makes a meeting type and copies its
// link; a signed-out visitor books, sees the confirmation and cancels; the booking reaches the
// rep's calendar and the person), the Outreach Desk (ask, refine, mark as sent; the thread stays; D-056 replaced the F23 chat
// after reloading) and F24 Fill with AI (fields filled and marked, then saved). AI runs in
// test mode (AI_FAKE).
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const REP = { name: "Cara Calendar", email: "cara@lumor.tech", password: "rep-password-25" };

test.describe.configure({ mode: "serial" });

let rep: Page;
let link = "";
let manageUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

test.beforeAll(async ({ browser }) => {
  rep = await newPage(browser);
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("the sidebar lists My tasks, Calendar, Companies, People in that order", async () => {
  const nav = shown(rep.getByRole("navigation", { name: "Main" }));
  const labels = await nav.getByRole("link").allInnerTexts();
  expect(labels.slice(0, 4).map((l) => l.trim())).toEqual([
    "My tasks",
    "Calendar",
    "Companies",
    "People",
  ]);
});

test("exit check: a rep sets hours, creates a meeting type and copies its link", async () => {
  await rep.goto("/calendar/availability");
  const hours = shown(rep.getByRole("region", { name: "Weekly hours" }));
  await expect(hours.getByLabel("Monday from")).toHaveValue("10:00");
  // Saturday mornings too.
  await hours.getByRole("button", { name: "Add hours on Saturday" }).click();
  await shown(rep.getByRole("button", { name: "Save availability" })).click();
  await expect(shown(rep.getByText("Availability saved."))).toBeVisible();

  await rep.goto("/calendar/events");
  await expect(shown(rep.getByText("No events yet"))).toBeVisible();
  await shown(rep.getByRole("button", { name: "New event" })).click();
  const dialog = rep.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Lumor demo");
  // A new event gets a random link code, not one from its name (D-045).
  await expect(dialog.getByLabel("Link code")).toHaveValue(/^[a-z0-9]{8}$/);
  await dialog.getByLabel("Link code").fill("demo");
  await dialog.getByLabel("Minimum notice (hours)").fill("1");
  await dialog
    .getByLabel("Online: meeting link or phone (optional)")
    .fill("https://meet.google.com/abc-defg-hij");
  await dialog.getByRole("button", { name: "Add a question" }).click();
  await dialog.getByLabel("Question 1", { exact: true }).fill("What do you research?");
  await dialog.getByRole("button", { name: "Create event" }).click();
  await expect(shown(rep.getByText("Lumor demo saved."))).toBeVisible();
  link = await shown(rep.getByLabel("Booking link for Lumor demo")).inputValue();
  expect(link).toMatch(/\/book\/cara\/demo$/);
  await rep.screenshot({ path: "test-results/v25-meeting-types.png", fullPage: true });
});

test("exit check: a signed-out visitor books a slot and sees the confirmation", async ({
  browser,
}) => {
  const visitor = await newPage(browser);
  await visitor.goto(new URL(link).pathname);
  await expect(shown(visitor.getByRole("heading", { name: "Lumor demo" }))).toBeVisible();
  await expect(visitor.getByText("Cara Calendar", { exact: true })).toBeVisible();
  await visitor.getByRole("button", { name: "Choose a time" }).click();
  const firstTime = visitor.getByRole("group", { name: "Times" }).getByRole("button").first();
  const chosen = (await firstTime.innerText()).trim();
  // The chosen day, e.g. "3" in the month grid (the pressed date).
  const chosenDay = (
    await visitor
      .getByRole("group", { name: "Days" })
      .getByRole("button", { pressed: true })
      .innerText()
  ).trim();
  await firstTime.click();
  await visitor.getByLabel("Your name").fill("Vera Visitor");
  await visitor.getByLabel("Work email").fill("vera@visitor.example");
  await visitor.getByLabel("Company").fill("Visitor Research");
  await visitor.getByLabel("LinkedIn profile (optional)").fill("linkedin.com/in/vera-visitor-v25");
  await visitor.getByLabel("What do you research?").fill("Shopper habits");
  await visitor.getByRole("radio", { name: /Online/ }).check();
  await visitor.screenshot({ path: "test-results/v25-booking-form.png", fullPage: true });
  await visitor.getByRole("button", { name: "Confirm booking" }).click();
  await expect(visitor).toHaveURL(/\/booking\/[A-Za-z0-9_-]+\?new=1$/);
  await expect(visitor.getByRole("heading", { name: "You’re booked" })).toBeVisible();
  // Only Reschedule and Cancel after booking (D-043).
  await expect(visitor.getByRole("button", { name: "Reschedule" })).toBeVisible();
  await expect(visitor.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Add to Google Calendar" })).toHaveCount(0);
  // v2.7.10 (D-053): the meeting's link is also shown as text, the same one the rep sees.
  await expect(visitor.getByText("meet.google.com/abc-defg-hij", { exact: true })).toBeVisible();
  manageUrl = new URL(visitor.url()).pathname;
  await visitor.screenshot({ path: "test-results/v25-booked.png", fullPage: true });

  // The slot is gone from the booking page.
  await visitor.goto(new URL(link).pathname);
  await visitor.getByRole("button", { name: "Choose a time" }).click();
  const times = visitor.getByRole("group", { name: "Times" });
  const days = visitor.getByRole("group", { name: "Days" });
  const sameDay = days.getByRole("button", { name: new RegExp(` ${chosenDay} [A-Z]`) });
  if (await sameDay.first().isEnabled()) {
    // The day still has free times: the taken one stays in the list, greyed out (D-048).
    await sameDay.first().click();
    await expect(times.getByRole("button", { name: `${chosen}, taken` })).toBeDisabled();
  } else {
    // It was the day's last free time: the whole day can't be picked any more.
    await expect(sameDay.first()).toBeDisabled();
  }
  await visitor.context().close();
});

test("exit check: the booking is on the rep's calendar and their new person", async () => {
  await rep.goto("/calendar?view=list");
  const table = shown(rep.getByRole("table", { name: "Upcoming bookings" }));
  await expect(table).toContainText("Vera Visitor");
  await table
    .getByRole("link", { name: /\d{4}, / })
    .first()
    .click();
  await expect(rep.getByRole("dialog")).toContainText("Shopper habits");
  // v2.7.10 (D-053): the same link as text under Join, so both sides can compare it.
  await expect(
    rep.getByRole("dialog").getByText("meet.google.com/abc-defg-hij", { exact: true }),
  ).toBeVisible();
  await rep.screenshot({ path: "test-results/v25-meeting-window.png" });
  await rep.keyboard.press("Escape");
  await table.getByRole("link", { name: "Vera Visitor" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await expect(rep.locator("dl").getByText("Meeting scheduled", { exact: true })).toBeVisible();
  const meetings = shown(rep.getByRole("region", { name: "Meetings" }));
  await expect(meetings).toContainText("Lumor demo with Cara Calendar");
  await expect(meetings.getByLabel("Lumor demo (30 min)")).toHaveValue(link);
});

test("exit check: the visitor cancels from their link", async ({ browser }) => {
  const visitor = await newPage(browser);
  await visitor.goto(manageUrl);
  await visitor.getByRole("button", { name: "Cancel booking" }).click();
  await visitor.getByLabel("Reason (optional)").fill("Clash");
  await visitor.getByRole("button", { name: "Yes, cancel it" }).click();
  await expect(visitor.getByText("This booking is cancelled.")).toBeVisible();
  await visitor.context().close();
  await rep.goto("/calendar?view=list");
  await expect(shown(rep.getByRole("table", { name: "Upcoming bookings" }))).toContainText(
    "Cancelled by them",
  );
});

test("exit check: ask the AI on the Desk, refine, send, and the thread stays", async () => {
  await rep.goto("/people");
  await shown(rep.getByRole("link", { name: "Vera Visitor" })).click();
  const desk = shown(rep.getByRole("region", { name: "AI assistant" }));
  const thread = desk.getByRole("log", { name: "Outreach thread" });
  await desk.getByText("Ask AI", { exact: true }).click();
  await desk.getByLabel("Instruction for the AI (optional)").fill("What should I send Vera?");
  await desk.getByLabel("Instruction for the AI (optional)").press("Control+Enter");
  await expect(thread.getByRole("article", { name: "Option: Question first" })).toBeVisible();
  await desk.getByLabel("Instruction for the AI (optional)").fill("Make it shorter");
  await desk.getByRole("button", { name: "Draft", exact: true }).click();
  const shorter = thread.getByRole("article", { name: "Option: Shorter" });
  await expect(shorter).toContainText("Hi Vera, how do you recruit for surveys today?");
  await rep.screenshot({ path: "test-results/v25-chat.png", fullPage: true });
  await shorter.getByRole("button", { name: "Mark as sent: Shorter" }).click();
  await expect(shown(rep.getByText("Marked as sent."))).toBeVisible();
  await rep.reload();
  await expect(
    shown(rep.getByRole("region", { name: "Conversation" })).getByText(
      "Hi Vera, how do you recruit for surveys today?",
    ),
  ).toBeVisible();
  await expect(shown(rep.getByRole("log", { name: "Outreach thread" }))).toContainText(
    "Make it shorter",
  );
});

test("exit check: Fill with AI fills the empty company fields, marked, then saved", async () => {
  await rep.goto("/companies");
  await shown(rep.getByRole("button", { name: "Add company" })).click();
  const dialog = rep.getByRole("dialog");
  await dialog.getByLabel("Company name").fill("Panelwise");
  await dialog.getByRole("button", { name: "Fill with AI" }).click();
  await expect(dialog.getByText(/Filled \d+ fields \(confidence: high\)/)).toBeVisible();
  await expect(dialog.getByLabel("Website")).toHaveValue("https://www.panelwise.com");
  await expect(dialog.getByLabel("City")).toHaveValue("Bangalore");
  await expect(dialog.getByLabel("Notes")).toHaveValue(/Headquarters: London, United Kingdom/);
  await expect(dialog.getByText("Filled by AI. Check it.").first()).toBeVisible();
  await rep.screenshot({ path: "test-results/v25-fill.png", fullPage: true });
  await dialog.getByLabel("City").fill("Bengaluru");
  await dialog.getByRole("button", { name: "Add company" }).click();
  await expect(rep).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
  await expect(shown(rep.getByText("https://www.panelwise.com"))).toBeVisible();
});
