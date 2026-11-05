// v2.13.0 exit check (D-059): downloads follow the switches on screen; follow-ups default to
// tomorrow; My tasks shows what you logged today with each follow-up date to change; loading
// shows a spinning circle.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
test.describe.configure({ mode: "serial" });
let admin: Page;
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
});

test("exit check: adding a person and the Follow-up box start on tomorrow", async () => {
  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const add = admin.getByRole("dialog");
  await expect(add.getByLabel("Next action date")).toHaveValue(istDate(1));
  await add.getByLabel("Full name").fill("Tara Tasks");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/tara-tasks-v213");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("Tasks Co");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "Follow-up" }).check();
  await expect(convo.getByLabel("Follow-up date")).toHaveValue(istDate(1));
  await convo.getByRole("radio", { name: "From me" }).check();
  await convo.getByLabel("What you sent or said").fill("Hi Tara, a quick question");
  await convo.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(admin.getByText("Added to the conversation."))).toBeVisible();
});

test("exit check: My tasks shows what you logged today, with the follow-up date to change", async () => {
  await shown(admin.getByRole("link", { name: "My tasks" })).click();
  await expect(admin).toHaveURL("/");
  await expect(admin.getByRole("heading", { name: "My tasks", level: 1 })).toBeVisible();
  const logged = shown(admin.getByRole("region", { name: "What you logged today" }));
  const date = logged.getByLabel("Follow-up date for Tara Tasks");
  await expect(date).toHaveValue(istDate(1));
  await date.fill(istDate(3));
  await logged.getByRole("button", { name: "Save" }).click();
  await expect(shown(admin.getByText("Follow-up saved for Tara Tasks."))).toBeVisible();
  await expect(logged.getByLabel("Follow-up date for Tara Tasks")).toHaveValue(istDate(3));
});

test("exit check: a download leaves out what's switched off, even straight after the click", async () => {
  await admin.goto("/reports");
  const form = shown(admin.getByRole("form", { name: "Make a report" }));
  await form.getByLabel("Period").selectOption("today");
  await form.getByRole("button", { name: "Generate" }).click();
  // Loading shows the spinning circle while the report is made.
  await expect(admin).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);
  await shown(admin.getByRole("switch", { name: "Include Activity in the report" })).uncheck();
  // The link already carries the choice; once saved, it's ready.
  await expect(shown(admin.getByText("Left out of the report."))).toBeVisible();
  const pdf = shown(admin.getByRole("link", { name: "Download PDF" }));
  await expect(pdf).toHaveAttribute("href", /\?hide=activity$/);
  const csvHref = await shown(admin.getByRole("link", { name: "Download CSV" })).getAttribute(
    "href",
  );
  const csv = await (await admin.request.get(csvHref!)).text();
  expect(csv).not.toContain("Activity\r\n");
  expect(csv).toContain("Replies and outcomes");
  // Editing numbers: downloads wait for Save or Cancel.
  await shown(admin.getByRole("button", { name: "Edit numbers" })).click();
  await expect(admin.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
  await expect(shown(admin.getByText("Save or cancel the edited numbers first."))).toBeVisible();
  await shown(admin.getByRole("button", { name: "Cancel" })).click();
  await expect(shown(admin.getByRole("link", { name: "Download PDF" }))).toBeVisible();
});

test("exit check: moving to another page shows the loading spinner", async () => {
  await admin.goto("/");
  // Slow the next page down so the spinner is visible.
  await admin.route(
    "**/companies**",
    async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      // The page may have moved on already; that request no longer matters then.
      await route.continue().catch(() => {});
    },
    { times: 1 },
  );
  await shown(admin.getByRole("link", { name: "Companies" })).click();
  await expect(shown(admin.getByRole("status").filter({ hasText: "Loading…" }))).toBeVisible();
  await expect(admin).toHaveURL("/companies");
  await admin.unrouteAll({ behavior: "ignoreErrors" });
});
