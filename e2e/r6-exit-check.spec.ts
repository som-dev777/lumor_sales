// The R6 exit check from the PRD, automated with the stand-in AI (AI_FAKE, so no real API
// calls): a reply returns a reply type, 2–3 suggestions and a stage suggestion; Today ranks a
// real rep's list. Plus summarise and draft. From R8 the reply is added to the conversation and
// "Suggest next message" replaces the Reply Assistant (F18).
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Kiran Rep", email: "kiran@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;
const leadUrls: string[] = [];

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  return (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
}

async function addLead(name: string, slug: string) {
  await rep.goto("/people");
  await rep.getByRole("button", { name: "Add person" }).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Full name").fill(name);
  await d.getByLabel("LinkedIn profile link").fill(`linkedin.com/in/${slug}`);
  await d.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await d.getByLabel("New company name").fill("Insight Co R6");
  await d.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  leadUrls.push(new URL(rep.url()).pathname);
}

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");
  // The AI reads the starting knowledge base (seeded by the test server).

  rep = await newPage(browser);
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("exit check: a reply gets a reply type and a drafted response, marked as sent", async () => {
  await addLead("Asha Verma", "asha-verma-r6");
  // The Outreach Desk (D-056) in the AI assistant panel: paste their reply, get drafts.
  const desk = shown(rep.getByRole("region", { name: "AI assistant" }));
  await desk.getByLabel("What they replied").fill("Sounds interesting. How does it work?");
  await desk.getByRole("button", { name: "Add reply & draft" }).click();
  const thread = desk.getByRole("log", { name: "Outreach thread" });
  await expect(thread.getByLabel("Reply type", { exact: true })).toHaveValue("Interested");
  await expect(thread).toContainText("Interested. They asked how it works");
  await rep.screenshot({ path: "test-results/r6-assistant.png", fullPage: true });
  await expect(rep.locator("dl").getByText("Replied", { exact: true })).toBeVisible();

  // The rep edits a draft lightly and marks it as sent.
  const option = thread.getByRole("article", { name: "Option: Share the link" });
  await option.getByRole("button", { name: "Edit Share the link" }).click();
  const text = option.getByLabel("Edit Share the link");
  await text.fill((await text.inputValue()) + " Thanks!");
  await option.getByRole("button", { name: "Mark as sent: Share the link" }).click();
  await expect(shown(rep.getByText("Marked as sent."))).toBeVisible();
  await rep.reload();
  await expect(shown(rep.getByText("Sounds interesting. How does it work?"))).toBeVisible();
  await expect(shown(rep.getByText(/Thanks!$/))).toBeVisible();
});

test("summarise the conversation and save it as a note; a draft with a placeholder is blocked until filled", async () => {
  await rep.goto(leadUrls[0]);
  await rep.getByRole("button", { name: "Summarise conversation" }).click();
  await rep.getByRole("button", { name: "Summarise", exact: true }).click();
  await expect(rep.getByText(/Asha Verma is interested/)).toBeVisible();
  await rep.getByRole("button", { name: "Save as note" }).click();
  await expect(shown(rep.getByText("Saved as a note."))).toBeVisible();
  await rep.getByRole("button", { name: "Confirm" }).click();
  await expect(shown(rep.getByText("Next step saved."))).toBeVisible();

  const desk = shown(rep.getByRole("region", { name: "AI assistant" }));
  await desk.getByText("Ask AI", { exact: true }).click();
  await desk.getByRole("button", { name: "Draft", exact: true }).click();
  const option = desk.getByRole("article", { name: "Option: Demo slots" }).last();
  await option.getByRole("button", { name: "Mark as sent: Demo slots" }).click();
  // Unknown values stay visible as placeholders; the rep fills them before sending.
  await expect(option.getByText("Fill in {slot 1} first.")).toBeVisible();
  const text = option.getByLabel("Edit Demo slots");
  await text.fill((await text.inputValue()).replace(/\{[^}]*\}/g, "Tuesday 11am"));
  await option.getByRole("button", { name: "Mark as sent: Demo slots" }).click();
  await expect(shown(rep.getByText("Marked as sent."))).toBeVisible();
});

test("exit check: Today shows the rep's list and ranks it; Done and Snooze clear tasks", async () => {
  await addLead("Bilal Khan", "bilal-khan-r6");
  await rep.getByRole("button", { name: "Got a reply", exact: true }).click();
  await rep.getByRole("dialog").getByLabel("Reply type").selectOption("Not now");
  await rep.getByRole("dialog").getByRole("button", { name: "Log it" }).click();
  await addLead("Chitra Rao", "chitra-rao-r6");
  await rep.getByRole("button", { name: "Got a reply", exact: true }).click();
  await rep.getByRole("dialog").getByLabel("Reply type").selectOption("Interested");
  await rep.getByRole("dialog").getByRole("button", { name: "Log it" }).click();
  await expect(rep.getByRole("dialog")).toBeHidden();

  await rep.goto("/");
  const replies = shown(rep.getByRole("region", { name: "Replies waiting" }));
  await expect(replies.getByRole("listitem")).toHaveCount(2);
  await expect(shown(rep.getByText(/of 20 new people today/))).toBeVisible();

  await rep.getByRole("button", { name: "Rank with AI" }).click();
  await expect(shown(rep.getByRole("region", { name: "Your week" }))).toContainText(
    "requests this week",
  );
  const ranked = shown(rep.getByRole("list", { name: "Ranked tasks" }));
  // The 2 replies. The earlier lead was worked on today, so isn't asked for a follow-up date
  // until tomorrow (D-055).
  await expect(ranked.getByRole("listitem")).toHaveCount(2);
  await expect(ranked.getByText(/^Ranked: /).first()).toBeVisible();
  await rep.screenshot({ path: "test-results/r6-today.png", fullPage: true });

  await rep.getByRole("button", { name: "Done: Mark replied for Bilal Khan" }).click();
  // Answered: done for today, so Bilal leaves Today at once (D-055). Tomorrow he'd be asked for a
  // next follow-up date (D-044).
  await expect(rep.getByRole("listitem", { name: "Bilal Khan" })).toHaveCount(0);

  await rep.getByRole("button", { name: "Snooze Chitra Rao" }).click();
  await rep
    .getByRole("dialog")
    .getByRole("button", { name: /^Snooze to / })
    .click();
  await expect(rep.getByRole("listitem", { name: "Chitra Rao" })).toHaveCount(0);
});
