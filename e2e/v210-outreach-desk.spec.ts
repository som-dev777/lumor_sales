// v2.10.0 exit check (D-056; docs/specs/outreach-desk.md section 10, inside the AI assistant
// panel): Who they are, Initiate, Copy, Mark as sent, a WhatsApp reply (plan paused, reply type
// in the tip), Ask AI to move to email (subjects), a Call talk track with Mark as called, the
// placeholder block with inline editing, Dictate, and old entries in the thread. AI in fake mode.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let personUrl = "";
const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const desk = () => shown(admin.getByRole("region", { name: "AI assistant" }));
const thread = () => desk().getByRole("log", { name: "Outreach thread" });

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  admin = await context.newPage();
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");

  await admin.goto("/people");
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  const add = admin.getByRole("dialog");
  await add.getByLabel("Full name").fill("Dana Desk");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/dana-desk-v210");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("Desk Research Co");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(admin.url()).pathname;

  // On a plan, so a reply visibly pauses it.
  await admin.goto("/people?view=all");
  await shown(admin.getByLabel("Select Dana Desk")).check();
  const bar = shown(admin.getByRole("region", { name: "Selected leads" }));
  await bar.getByLabel("Plan").selectOption({ label: "Official Outreach" });
  await bar.getByRole("button", { name: "Enrol in plan" }).click();
  await expect(shown(admin.getByText("1 enrolled."))).toBeVisible();
  await admin.goto(personUrl);
});

test("exit check: an old note shows in the thread; Who they are; Initiate gives 2 options and a tip", async () => {
  // Something logged the old way (the page's Conversation box) shows on the Desk thread.
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "Note" }).check();
  await convo.getByLabel("Add a note").fill("Met Dana at the research meetup.");
  await convo.getByRole("button", { name: "Add note" }).click();
  await expect(thread()).toContainText("Met Dana at the research meetup.");

  // The rep's title, asked once, for sign-offs.
  await desk().getByLabel("Your title, for signatures").fill("Co-founder");
  await desk().getByRole("button", { name: "Save title" }).click();
  await expect(shown(admin.getByText("Title saved."))).toBeVisible();

  const who = thread().getByRole("region", { name: "Who they are" });
  await who.getByLabel("Who they are").fill("Head of research at a 40-person agency.");
  await who.getByRole("button", { name: "Save" }).click();
  await expect(who).toContainText("Head of research at a 40-person agency.");

  await desk().getByLabel("Channel").selectOption("LinkedIn message");
  await desk().getByRole("button", { name: "Initiate" }).click();
  const draft = thread().getByRole("region", { name: "AI drafts · LinkedIn message" });
  await expect(draft.getByRole("article")).toHaveCount(2);
  await expect(draft.getByRole("article", { name: "Option: Question first" })).toBeVisible();
  await expect(draft).toContainText("One opens with a question");
  await admin.screenshot({ path: "test-results/v210-initiate.png", fullPage: true });
});

test("exit check: Copy, then Mark as sent shows a right-hand bubble", async () => {
  const option = thread().getByRole("article", { name: "Option: Question first" });
  await option.getByRole("button", { name: "Copy Question first" }).click();
  await expect(shown(admin.getByText("Copied."))).toBeVisible();
  const copied = await admin.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("How does your team find participants for studies today?");
  await option.getByRole("button", { name: "Mark as sent: Question first" }).click();
  await expect(shown(admin.getByText("Marked as sent."))).toBeVisible();
  await expect(thread()).toContainText("You sent · LinkedIn message");
  await expect(desk().getByRole("button", { name: "Initiate" })).toHaveCount(0);
});

test("exit check: a WhatsApp reply gives WhatsApp drafts, the reply type, and pauses the plan", async () => {
  await desk().getByLabel("Channel").selectOption("WhatsApp");
  await desk().getByLabel("What they replied").fill("Sounds interesting. How does it work?");
  await desk().getByRole("button", { name: "Add reply & draft" }).click();
  const draft = thread().getByRole("region", { name: "AI drafts · WhatsApp" });
  await expect(draft).toContainText("Interested.");
  await expect(thread()).toContainText("Dana · WhatsApp");
  await expect(thread().getByLabel("Reply type", { exact: true })).toHaveValue("Interested");
  await expect(admin.locator("dl").first()).toContainText("(paused)");
});

test("exit check: Ask AI to move to email gives drafts with subject lines", async () => {
  await desk().getByText("Ask AI", { exact: true }).click();
  await desk().getByLabel("Channel").selectOption("Email");
  await desk()
    .getByLabel("Instruction for the AI (optional)")
    .fill("make it shorter and move to email");
  await desk().getByRole("button", { name: "Draft", exact: true }).click();
  const draft = thread().getByRole("region", { name: "AI drafts · Email" });
  await expect(draft).toContainText("Subject: A question about your research, Dana");
  await expect(thread()).toContainText("make it shorter and move to email");
});

test("exit check: placeholders block Mark as sent until edited inline", async () => {
  const draft = thread().getByRole("region", { name: "AI drafts · Email" });
  const option = draft.getByRole("article", { name: "Option: Demo slots" });
  await option.getByRole("button", { name: "Mark as sent: Demo slots" }).click();
  await expect(option.getByText("Fill in {slot 1} first.")).toBeVisible();
  const text = option.getByLabel("Edit Demo slots");
  await text.fill(
    (await text.inputValue())
      .replace("{slot 1}", "Tuesday 11am")
      .replace("{slot 2}", "Wednesday 4pm"),
  );
  await option.getByRole("button", { name: "Mark as sent: Demo slots" }).click();
  await expect(shown(admin.getByText("Marked as sent."))).toBeVisible();
  await expect(thread()).toContainText("You sent · Email");
});

test("exit check: Call gives a talk track with Mark as called; Dictate is there", async () => {
  await desk().getByLabel("Channel").selectOption("Call");
  await desk().getByText("Ask AI", { exact: true }).click();
  await desk().getByRole("button", { name: "Draft", exact: true }).click();
  const draft = thread().getByRole("region", { name: "AI drafts · Call" });
  await expect(draft.getByRole("article").first()).toContainText("Opening:");
  const direct = draft.getByRole("article", { name: "Option: Straight to the demo" });
  await direct.getByRole("button", { name: "Mark as called: Straight to the demo" }).click();
  // A call right after an email can trip the cadence guardrails: log it anyway.
  const anyway = direct.getByRole("button", { name: "Log anyway" });
  await expect(shown(admin.getByText("Logged as called.")).or(anyway)).toBeVisible();
  if (await anyway.isVisible()) await anyway.click();
  await expect(thread()).toContainText("You called · Call");
  await expect(desk().getByRole("button", { name: "Dictate" })).toBeVisible();
  await admin.screenshot({ path: "test-results/v210-desk.png", fullPage: true });
});
