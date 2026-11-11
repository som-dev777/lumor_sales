// v2.14.0 exit check (D-060): each step's days are the follow-up after it; someone already
// contacted starts at the right step; the person's page shows the step and the next follow-up at
// the top; a follow-up set on the person goes ahead of the plan's date.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let personUrl = "";
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");
});

test("exit check: the builder asks for the follow-up after each step", async () => {
  await admin.goto("/plans/new");
  const step1 = shown(admin.getByRole("region", { name: "Step 1" }));
  await expect(step1.getByLabel("Follow up after (days)")).toHaveValue("2");
  await expect(step1).toContainText("Step 2 follows 2 days after they accept.");
  await expect(shown(admin.getByRole("region", { name: "Step 2" }))).toContainText(
    "The plan finishes 3 days after this step.",
  );
});

test("exit check: someone already messaged starts at step 3; the top shows step and follow-up", async () => {
  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill("Tara History");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/tara-history-v214");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("History Labs");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(admin.url()).pathname;

  // Already in touch: a LinkedIn message sent, before any plan.
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "From me" }).check();
  await convo.getByLabel("What you sent or said").fill("Hi Tara, how do you recruit for studies?");
  await convo.getByLabel("Next follow-up").fill("");
  await convo.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(admin.getByText("Added to the conversation."))).toBeVisible();

  // Put on the plan: the request and Message 1 count as done.
  const panel = shown(admin.getByRole("region", { name: "Plan" }));
  await panel.getByLabel("Enrol in a plan").selectOption({ label: "Official Outreach" });
  await panel.getByRole("button", { name: "Enrol" }).click();
  await expect(panel).toContainText("Step 3 of 5: LinkedIn message");
  const top = shown(admin.getByRole("group", { name: "Plan and next follow-up" }));
  await expect(top).toContainText("Official Outreach · step 3 of 5: LinkedIn message");
  await expect(top).toContainText("Step 3 of 5: LinkedIn message");

  // A follow-up set on the person now goes ahead of the plan's date.
  await convo.getByRole("radio", { name: "Follow-up" }).check();
  await convo.getByLabel("Next action").fill("Send the panel study");
  await convo.getByRole("button", { name: "Set follow-up" }).click();
  await expect(top).toContainText("Send the panel study");
  await expect(top).toContainText("ahead of the plan");
  await expect(panel).toContainText("instead of the plan's date");
  await admin.screenshot({ path: "test-results/v214-person.png", fullPage: true });
});

test("Match step to history keeps them at the step their history shows", async () => {
  await admin.goto(personUrl);
  const panel = shown(admin.getByRole("region", { name: "Plan" }));
  await panel.getByText("Switch, match or stop this plan").click();
  await panel.getByRole("button", { name: "Match step to history" }).click();
  await expect(shown(admin.getByText(/Now at step 3 of 5/))).toBeVisible();
});
