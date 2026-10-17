// The R7 exit check from the PRD, automated: enrol a person in the seed plan, complete steps on
// time and late, and confirm weekends are skipped and dates shift; a pasted reply pauses the
// plan; the builder blocks a sixth touch. Dates come from the local test date switch (D-033).
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Leela Rep", email: "leela@lumor.tech", password: "rep-password-12" };
const BASE = "http://localhost:3100";

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
let repContext: BrowserContext;
let personUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const panel = (page: Page) => shown(page.getByRole("region", { name: "Plan", exact: true }));

async function newPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { context, page: await context.newPage() };
}

/** Pretend today is `date` (the local-only test date switch). */
async function setDate(date: string) {
  await repContext.addCookies([{ name: "lumor-test-date", value: date, url: BASE }]);
}

test.beforeAll(async ({ browser }) => {
  admin = (await newPage(browser)).page;
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");
  // Product Facts for the Reply Assistant (stand-in AI).
  await admin.goto("/settings/product-facts");
  await admin.getByRole("button", { name: "Edit" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("What Lumor does").fill("An AI research assistant for insight teams.");
  await d.getByLabel("Live features").fill("Survey analysis");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();

  const r = await newPage(browser);
  rep = r.page;
  repContext = r.context;
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("the seed Official Outreach plan has 5 steps, waits 2 → 4 → 7 → 10, weekends skipped", async () => {
  await rep.goto("/plans");
  await rep.getByRole("link", { name: "Official Outreach" }).click();
  const steps = shown(rep.getByRole("region", { name: "Steps" }));
  await expect(steps.getByRole("listitem")).toHaveCount(5);
  await expect(steps).toContainText("2 days after the connection is accepted");
  await expect(steps).toContainText(
    "Call if a phone is known → otherwise Email if an email is known → otherwise LinkedIn message",
  );
  await expect(steps).toContainText("10 days after step 4 is done");
  await expect(shown(rep.getByText(/Skip weekends: on/))).toBeVisible();
  await expect(shown(rep.getByText("This plan follows every guardrail."))).toBeVisible();
});

test("exit check: the builder blocks a sixth touch (and steps that break the gaps)", async () => {
  await admin.goto("/plans");
  await admin.getByRole("link", { name: "Official Outreach" }).click();
  await admin.getByRole("button", { name: "Duplicate" }).click();
  await expect(admin).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
  await expect(
    shown(admin.getByRole("heading", { name: "Official Outreach (copy)" })),
  ).toBeVisible();
  await admin.getByRole("link", { name: "Edit steps" }).click();
  await expect(admin).toHaveURL(/\/edit$/);
  // One more step: the plan would run past 30 days (guardrail 7).
  await admin.getByRole("button", { name: "Add step" }).click();
  await shown(admin.getByRole("region", { name: "Step 6" }))
    .getByLabel("Wait (days)")
    .fill("14");
  await admin.getByRole("button", { name: "Save plan" }).click();
  await expect(shown(admin.getByText(/must end within 30 days/)).first()).toBeVisible();
  // Two more: a 5th follow-up after Message 1 (guardrail 3, the "sixth touch").
  await admin.getByRole("button", { name: "Add step" }).click();
  await shown(admin.getByRole("region", { name: "Step 7" }))
    .getByLabel("Wait (days)")
    .fill("18");
  await admin.getByRole("button", { name: "Save plan" }).click();
  await expect(
    shown(admin.getByText(/At most 4 follow-ups after Message 1\. This plan has 5\./)).first(),
  ).toBeVisible();
  // Gaps must grow: Follow-up 2 three days after Follow-up 1 is refused.
  await admin.getByRole("button", { name: "Remove step 7" }).click();
  await admin.getByRole("button", { name: "Remove step 6" }).click();
  await shown(admin.getByRole("region", { name: "Step 4" }))
    .getByLabel("Wait (days)")
    .fill("3");
  await admin.getByRole("button", { name: "Save plan" }).click();
  await expect(
    shown(admin.getByText(/each gap must be longer than the last/)).first(),
  ).toBeVisible();
  await admin.screenshot({ path: "test-results/r7-builder.png", fullPage: true });
});

test("exit check: enrol, on time, wait for acceptance, weekend → Monday, late shifts later steps", async () => {
  await setDate("2026-10-19"); // Monday
  await rep.goto("/people");
  await shown(rep.getByRole("button", { name: "Add person" })).click();
  const add = rep.getByRole("dialog");
  await add.getByLabel("Full name").fill("Ella Plan");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/ella-plan-r7");
  await add.getByLabel("Company").fill("Insight Co R7");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(rep.url()).pathname;

  // Enrol from People.
  await rep.goto("/people");
  await shown(rep.getByLabel("Select Ella Plan")).check();
  const bar = shown(rep.getByRole("region", { name: "Selected leads" }));
  await bar.getByLabel("Plan").selectOption({ label: "Official Outreach" });
  await bar.getByRole("button", { name: "Enrol in plan" }).click();
  await expect(shown(rep.getByText("1 enrolled."))).toBeVisible();

  // Today: step 1 due today; Done sends the connection request.
  await rep.goto("/");
  const due = shown(rep.getByRole("region", { name: "Plan steps due today" }));
  await expect(due.getByRole("listitem", { name: "Ella Plan" })).toContainText(
    "Step 1 of 5: LinkedIn connection request",
  );
  await due.getByRole("button", { name: "Done: step for Ella Plan" }).click();
  await expect(shown(rep.getByText("Nothing due. Time for new outreach."))).toBeVisible();

  // Accepted on Thursday 22 Oct: Message 1 is due 2 days later, Saturday → Monday 26 Oct.
  await setDate("2026-10-22");
  await rep.goto(personUrl);
  await expect(panel(rep)).toContainText("Waiting for Ella Plan to accept");
  await shown(rep.getByRole("button", { name: "Accepted", exact: true })).click();
  await expect(panel(rep)).toContainText("Step 2 of 5: LinkedIn message");
  await expect(panel(rep)).toContainText("due 26 Oct 2026");

  // Done 3 days late, on Thursday 29 Oct: it's overdue, and the next step counts from the 29th.
  await setDate("2026-10-29");
  await rep.goto("/");
  const overdue = shown(rep.getByRole("region", { name: "Overdue steps" }));
  const task = overdue.getByRole("listitem", { name: "Ella Plan" });
  await expect(task).toContainText("due 26 Oct 2026");
  const box = task.getByLabel("Message to Ella Plan");
  await box.fill("Hi Ella, enjoyed your post on {topic}.");
  await task.getByRole("button", { name: "Done: step for Ella Plan" }).click();
  await expect(shown(rep.getByText("Fill in {topic} first."))).toBeVisible();
  await box.fill("Hi Ella, how does Insight Co run research today?");
  await task.getByRole("button", { name: "Done: step for Ella Plan" }).click();
  await expect(shown(rep.getByText("Done. The next step is scheduled."))).toBeVisible();
  await rep.goto(personUrl);
  // Follow-up 1 = 29 Oct + 4 = Monday 2 Nov (a day later than if Message 1 had been on time).
  await expect(panel(rep)).toContainText("Step 3 of 5: LinkedIn message");
  await expect(panel(rep)).toContainText("due 2 Nov 2026");
  await rep.screenshot({ path: "test-results/r7-person.png", fullPage: true });
});

test("exit check: a pasted reply pauses the plan; Resume brings it back", async () => {
  await setDate("2026-10-30");
  await rep.goto(personUrl);
  await shown(rep.getByLabel("Prospect's message")).fill("Interesting, tell me more.");
  await shown(rep.getByRole("button", { name: "Suggest replies" })).click();
  await expect(shown(rep.getByLabel("Reply type"))).toHaveValue("Interested");
  await rep.reload();
  await expect(panel(rep)).toContainText("Paused");
  await rep.goto("/");
  await expect(shown(rep.getByRole("region", { name: "Replies waiting" }))).toContainText(
    "Ella Plan",
  );
  await expect(rep.getByRole("region", { name: "Plan steps due today" })).toHaveCount(0);
  await rep.goto(personUrl);
  await panel(rep).getByRole("button", { name: "Resume" }).click();
  await expect(panel(rep)).toContainText("Step 3 of 5");
  await expect(panel(rep)).toContainText("due 30 Oct 2026");
});

test("Do not contact stops the plan and blocks outreach", async () => {
  await rep.goto(personUrl);
  await shown(rep.getByRole("button", { name: "Edit" })).click();
  const edit = rep.getByRole("dialog");
  await edit.getByLabel(/Do not contact/).check();
  await edit.getByLabel("Why not contact them?").fill("Asked us to stop");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(panel(rep)).toContainText("Not on a plan.");
  await shown(rep.getByRole("button", { name: "Message sent", exact: true })).click();
  await rep.getByRole("dialog").getByRole("button", { name: "Log it" }).click();
  await expect(shown(rep.getByRole("dialog").getByText(/Do not contact/))).toBeVisible();
  await repContext.clearCookies({ name: "lumor-test-date" });
});
