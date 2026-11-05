// v2.12.0 exit check (D-058): Include in report switches off and back on; the Pipeline's five
// headline numbers; no Plan adherence, Funnel or Plan performance; Events of the day, company by
// company with New pills and a summary per person; Connection request on the person page.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
test.describe.configure({ mode: "serial" });
let admin: Page;
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");
});

test("exit check: Connection request on the person page logs a request with its note", async () => {
  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill("Ola Person");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/ola-person-v212");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("Ola Electric Test");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "Connection request" }).check();
  await expect(convo.getByLabel("Channel")).toHaveCount(0);
  await convo.getByLabel("Note sent with it (optional)").fill("Loved your EV battery post");
  await convo.getByRole("button", { name: "Log connection request" }).click();
  await expect(shown(admin.getByText("Connection request logged."))).toBeVisible();
  await expect(shown(admin.getByRole("log", { name: "Outreach thread" }))).toContainText(
    "You sent · LinkedIn connection note",
  );
});

test("exit check: the report has five headline numbers, no plan sections, and Events of the day", async () => {
  await admin.goto("/reports");
  const form = shown(admin.getByRole("form", { name: "Make a report" }));
  await form.getByLabel("Period").selectOption("today");
  await form.getByRole("button", { name: "Generate" }).click();
  await expect(admin).toHaveURL(/\/reports\/[0-9a-f-]{36}$/);

  const pipeline = shown(admin.getByRole("region", { name: "Pipeline" }));
  for (const label of [
    "New outreach",
    "Follow-ups",
    "Responded",
    "Demos scheduled",
    "Demos conducted",
  ]) {
    await expect(pipeline).toContainText(label);
  }
  await expect(pipeline).not.toContainText("No response yet");
  for (const gone of ["Plan adherence", "Funnel", "Plan performance"]) {
    await expect(admin.getByRole("region", { name: gone })).toHaveCount(0);
  }
  await expect(shown(admin.getByRole("region", { name: "Activity" }))).toContainText(
    "Calls connected",
  );

  const events = shown(admin.getByRole("region", { name: "Events of the day" }));
  const co = events.getByRole("listitem", { name: "Ola Electric Test" });
  await expect(co).toContainText("New");
  const person = co.getByRole("listitem", { name: "Ola Person" });
  await expect(person).toContainText("New");
  await expect(person).toContainText("Connection request sent");
  await expect(person).toContainText("(with a note)");
  // The summary (the stand-in AI in tests).
  await expect(person).toContainText("Next step");
  await admin.screenshot({ path: "test-results/v212-report.png", fullPage: true });
});

test("exit check: Include in report switches off and back on", async () => {
  const sw = shown(admin.getByRole("switch", { name: "Include Activity in the report" }));
  await sw.uncheck();
  await expect(shown(admin.getByText("Left out of the report."))).toBeVisible();
  await expect(sw).not.toBeChecked();
  // Back on with the switch.
  await sw.check();
  await expect(shown(admin.getByText("Included in the report."))).toBeVisible();
  await expect(sw).toBeChecked();
  // And with the button inside the folded section.
  await sw.uncheck();
  const activity = shown(admin.getByRole("region", { name: "Activity" }));
  await activity.getByRole("button", { name: "Include it again" }).click();
  await expect(sw).toBeChecked();
  await admin.reload();
  await expect(
    shown(admin.getByRole("switch", { name: "Include Activity in the report" })),
  ).toBeChecked();
  // On a phone too.
  await admin.setViewportSize({ width: 390, height: 844 });
  const phone = shown(admin.getByRole("switch", { name: "Include Activity in the report" }));
  await phone.uncheck();
  await expect(phone).not.toBeChecked();
  await phone.check();
  await expect(phone).toBeChecked();
  await admin.setViewportSize({ width: 1280, height: 1000 });
});
