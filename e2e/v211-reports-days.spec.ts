// v2.11.0 exit check (D-057; Events of the day since D-058): a report lists who was contacted;
// sections can be left out (and the CSV follows); numbers can be edited on the report; People has
// Active today and Add follow-up; Today has Previous day / Next day.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let personUrl = "";
const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const istDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");

  // Someone added today, with a message logged today.
  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill("Rhea Report");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/rhea-report-v211");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("Report Labs");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(admin.url()).pathname;
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "From me" }).check();
  await convo.getByLabel("What you sent or said").fill("Hi Rhea, how do you recruit for studies?");
  await convo.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(admin.getByText("Added to the conversation."))).toBeVisible();
});

test("exit check: People has Active today, and Add follow-up for tomorrow", async () => {
  await admin.goto("/people?view=all&activity=today");
  await expect(shown(admin.getByRole("link", { name: "Rhea Report" }))).toBeVisible();
  await shown(admin.getByRole("button", { name: "Add a follow-up for Rhea Report" })).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Next action").fill("Send the case study");
  await dialog.getByRole("button", { name: "Tomorrow" }).click();
  await dialog.getByRole("button", { name: "Save follow-up" }).click();
  await expect(shown(admin.getByText("Follow-up saved for Rhea Report."))).toBeVisible();
  await expect(
    shown(admin.getByRole("button", { name: "Edit the follow-up for Rhea Report" })),
  ).toBeVisible();
});

test("exit check: Today's Next day shows what's due tomorrow; Previous day goes back", async () => {
  await admin.goto("/");
  await expect(admin.getByRole("listitem", { name: "Rhea Report" })).toHaveCount(0);
  await shown(admin.getByRole("link", { name: "Next day" })).click();
  await expect(admin).toHaveURL(`/?day=${istDate(1)}`);
  const due = shown(admin.getByRole("region", { name: /^Due on / }));
  await expect(due.getByRole("listitem", { name: "Rhea Report" })).toContainText(
    "Send the case study",
  );
  await admin.screenshot({ path: "test-results/v211-next-day.png", fullPage: true });
  await shown(admin.getByRole("link", { name: "Previous day" })).click();
  await expect(admin).toHaveURL("/");
  await shown(admin.getByRole("link", { name: "Previous day" })).click();
  await expect(admin).toHaveURL(`/?day=${istDate(-1)}`);
  await expect(shown(admin.getByRole("region", { name: /^Done on / }))).toBeVisible();
});

test("exit check: a report lists the day's events; sections can be left out; numbers edited", async () => {
  await admin.goto("/reports");
  const form = shown(admin.getByRole("form", { name: "Make a report" }));
  await form.getByLabel("Period").selectOption("today");
  await form.getByRole("button", { name: "Generate" }).click();
  await expect(admin).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  const reportUrl = new URL(admin.url()).pathname;

  // Events of the day (D-058 replaced What happened): the company and person, marked new.
  const events = shown(admin.getByRole("region", { name: "Events of the day" }));
  const co = events.getByRole("listitem", { name: "Report Labs" });
  await expect(co).toContainText("New");
  await expect(co.getByRole("listitem", { name: "Rhea Report" })).toContainText("New");

  // Leave Replies and outcomes out: it folds away here, and the CSV doesn't have it.
  await shown(
    admin.getByRole("switch", { name: "Include Replies and outcomes in the report" }),
  ).uncheck();
  await expect(shown(admin.getByText("Left out of the report."))).toBeVisible();
  await expect(shown(admin.getByRole("region", { name: "Replies and outcomes" }))).toContainText(
    "Left out of the PDF, CSV, email and print.",
  );
  const csv = await (await admin.request.get(`${reportUrl}/csv`)).text();
  expect(csv).not.toContain("Replies and outcomes");
  expect(csv).toContain("Rhea Report");

  // Edit a number on this report only.
  await shown(admin.getByRole("button", { name: "Edit numbers" })).click();
  const box = shown(admin.getByRole("spinbutton", { name: "Somnath · Connection requests" }));
  await box.fill("9");
  await shown(admin.getByRole("button", { name: "Save numbers" })).click();
  await expect(shown(admin.getByText("Numbers saved on this report."))).toBeVisible();
  const activity = shown(admin.getByRole("region", { name: "Activity" }));
  await expect(activity.getByTitle("Edited").first()).toContainText("9");
  await expect(shown(admin.getByText("1 number edited (marked)."))).toBeVisible();
  const csv2 = await (await admin.request.get(`${reportUrl}/csv`)).text();
  expect(csv2).toContain("Somnath,9,");
  await admin.screenshot({ path: "test-results/v211-report.png", fullPage: true });
  await expect(admin.getByRole("link", { name: "Download PDF" })).toBeVisible();
  const pdf = await admin.request.get(`${reportUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  // The person page still says the same: the app's data didn't change.
  await admin.goto(personUrl);
  await expect(shown(admin.getByRole("region", { name: "Conversation" }))).toContainText(
    "Hi Rhea, how do you recruit for studies?",
  );
});
