// The R8 exit check from the PRD, automated with the stand-in AI and the local test date switch:
// paste a conversation (the AI splits it, the rep saves it), get a suggestion for their reply,
// accept it with a 2-day reply-by date, then see the nudge task on Today once it expires. Plus
// the Admins' Team tab (F18, F08; D-038).
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Omar Rep", email: "omar@lumor.tech", password: "rep-password-12" };
const BASE = "http://localhost:3100";

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
let repContext: BrowserContext;
let personUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const conversation = () => shown(rep.getByRole("region", { name: "Conversation" }));

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

  await setDate("2026-11-02"); // a Monday
  await rep.goto("/people");
  await rep.getByRole("button", { name: "Add person" }).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Full name").fill("Nadia Thread");
  await d.getByLabel("LinkedIn profile link").fill("linkedin.com/in/nadia-thread-r8");
  await d.getByLabel("Company").fill("Insight Co R8");
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(rep.url()).pathname;
});

test("paste a whole conversation: the AI splits it, the rep checks it and saves it", async () => {
  await conversation().getByRole("button", { name: "Paste a whole conversation" }).click();
  const dialog = rep.getByRole("dialog");
  await dialog
    .getByLabel("Conversation")
    .fill(
      [
        "[2026-10-28 10:00] Me: Hi Nadia, saw your talk on research ops. How does your team recruit?",
        "[2026-11-01 18:30] Them: Sounds interesting. How does it work?",
      ].join("\n"),
    );
  await dialog.getByRole("button", { name: "Split into messages" }).click();
  const first = dialog.getByRole("listitem", { name: "Message 1" });
  await expect(first.getByLabel("From")).toHaveValue("me");
  await expect(first.getByLabel("When")).toHaveValue("2026-10-28T10:00");
  await expect(dialog.getByRole("listitem", { name: "Message 2" }).getByLabel("From")).toHaveValue(
    "them",
  );
  await dialog.getByRole("button", { name: "Save 2 messages" }).click();
  await expect(shown(rep.getByText("2 messages added."))).toBeVisible();

  await expect(conversation()).toContainText("How does your team recruit?");
  await expect(conversation()).toContainText("Nadia Thread · LinkedIn · 1 Nov 2026, 6:30 pm");
  await expect(rep.locator("dl").getByText("Replied", { exact: true })).toBeVisible();
});

test("exit check: suggest the next message and accept it with a 2-day reply-by date", async () => {
  await expect(shown(rep.getByText("Nadia replied on 1 Nov 2026. It's your turn."))).toBeVisible();
  await rep.getByRole("button", { name: "Suggest next message" }).click();
  await expect(rep.getByLabel("Reply type", { exact: true })).toHaveValue("Interested");
  const cards = rep.getByLabel(/^Reply: /);
  await expect(cards).toHaveCount(2);
  const replyBy = shown(rep.getByLabel("Expect a reply by"));
  await expect(replyBy).toHaveValue("2026-11-04");
  await rep.getByRole("button", { name: "Mark as sent" }).first().click();
  await expect(shown(rep.getByText("Logged as sent."))).toBeVisible();
  await rep.reload();
  await expect(
    shown(rep.getByText("You wrote last (2 Nov 2026). A reply is expected by 4 Nov 2026.")),
  ).toBeVisible();
  await rep.screenshot({ path: "test-results/r8-person.png", fullPage: true });
});

test("exit check: after the date passes, Today shows a nudge task with an AI draft", async () => {
  await setDate("2026-11-04");
  await rep.goto("/");
  await expect(rep.getByRole("region", { name: "Expired reply deadlines" })).toHaveCount(0);

  await setDate("2026-11-05");
  await rep.goto("/");
  const deadlines = shown(rep.getByRole("region", { name: "Expired reply deadlines" }));
  const task = deadlines.getByRole("listitem", { name: "Nadia Thread" });
  await expect(task).toContainText("Expected a reply by 4 Nov 2026 · nudge 1 of 2");
  await task.getByRole("button", { name: "Draft a nudge for Nadia Thread" }).click();
  await expect(task.getByLabel(/^Reply: /)).toHaveValue(/2-minute example/);
  await expect(task.getByLabel("Expect a reply by")).toHaveValue("2026-11-08");
  await rep.screenshot({ path: "test-results/r8-today.png", fullPage: true });
  await task.getByRole("button", { name: "Mark as sent" }).click();
  await expect(shown(rep.getByText("Logged as sent."))).toBeVisible();
  await rep.reload();
  await expect(rep.getByRole("region", { name: "Expired reply deadlines" })).toHaveCount(0);
});

test("a message from me is added with its channel and time; an Admin sees the thread", async () => {
  await rep.goto(personUrl);
  await conversation().getByLabel("From me").check();
  await conversation().getByLabel("Channel").selectOption("Call");
  await conversation().getByLabel("When").fill("2026-11-05T09:15");
  await conversation()
    .getByLabel("What you sent or said")
    .fill("Called: she'll check with her team.");
  await conversation().getByRole("button", { name: "Add to conversation" }).click();
  // Same day as the nudge: the cadence guardrails warn, and the rep can log it anyway.
  await expect(conversation()).toContainText("Only 0 days since the last touch.");
  await conversation().getByRole("button", { name: "Log anyway" }).click();
  await expect(shown(rep.getByText("Added to the conversation."))).toBeVisible();
  await expect(conversation()).toContainText("You · Call · 5 Nov 2026, 9:15 am");

  // An Admin can see the same thread.
  await admin.goto(personUrl);
  await expect(shown(admin.getByRole("region", { name: "Conversation" }))).toContainText(
    "Called: she'll check with her team.",
  );
  await repContext.clearCookies({ name: "lumor-test-date" });
});

test("exit check: Admins see the Team tab; reps don't", async () => {
  await admin.goto("/");
  await admin.getByRole("link", { name: "Team" }).click();
  await expect(admin).toHaveURL("/?tab=team");
  const table = shown(admin.getByRole("table", { name: "Team today" }));
  await expect(table.getByRole("row", { name: /Omar Rep/ })).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Replies waiting over 1 day" }),
  ).toBeVisible();
  await admin.screenshot({ path: "test-results/r8-team.png", fullPage: true });

  await rep.goto("/?tab=team");
  await expect(rep.getByRole("table", { name: "Team today" })).toHaveCount(0);
  await expect(rep.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
});
