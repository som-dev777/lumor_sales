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

test("exit check: a reply gets a reply type and a message from the AI chat, marked as sent", async () => {
  await addLead("Asha Verma", "asha-verma-r6");
  const conversation = shown(rep.getByRole("region", { name: "Conversation" }));
  await conversation.getByLabel("From Asha").check();
  await conversation
    .getByLabel("What Asha sent or said")
    .fill("Sounds interesting. How does it work?");
  await conversation.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(rep.getByText("Added to the conversation."))).toBeVisible();
  // The AI chat (F23) replaced the one-shot suggestions on the person page.
  await rep.getByRole("button", { name: "Suggest my next message" }).click();
  await expect(rep.getByLabel("Reply type", { exact: true })).toHaveValue("Interested");
  const chat = rep.getByRole("log", { name: "AI chat" });
  await expect(chat).toContainText("Here's a message for Asha.");
  await chat.getByRole("button", { name: "Use this message" }).click();
  const cards = rep.getByLabel(/^Reply: /);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveValue(/20-minute demo/);
  await rep.screenshot({ path: "test-results/r6-assistant.png", fullPage: true });
  await expect(rep.locator("dl").getByText("Replied", { exact: true })).toBeVisible();

  // The rep edits the draft lightly and marks it as sent.
  await cards.first().fill((await cards.first().inputValue()) + " Thanks!");
  await rep.getByRole("button", { name: "Mark as sent" }).first().click();
  await expect(shown(rep.getByText("Logged as sent."))).toBeVisible();
  await rep.reload();
  await expect(shown(rep.getByText("Sounds interesting. How does it work?"))).toBeVisible();
  await expect(shown(rep.getByText(/Thanks!$/))).toBeVisible();
});

test("summarise the conversation and save it as a note; draft from a template", async () => {
  await rep.goto(leadUrls[0]);
  await rep.getByRole("tab", { name: "Summarise conversation" }).click();
  await rep.getByRole("button", { name: "Summarise" }).click();
  await expect(rep.getByText(/Asha Verma is interested/)).toBeVisible();
  await rep.getByRole("button", { name: "Save as note" }).click();
  await expect(shown(rep.getByText("Saved as a note."))).toBeVisible();
  await rep.getByRole("button", { name: "Confirm" }).click();
  await expect(shown(rep.getByText("Next step saved."))).toBeVisible();

  await rep.getByRole("tab", { name: "Draft message" }).click();
  await rep.getByLabel("Template").selectOption({ index: 1 });
  await rep.getByRole("button", { name: "Draft", exact: true }).click();
  const draft = rep.getByLabel("Message", { exact: true });
  await expect(draft).not.toHaveValue("");
  // Unknown placeholders stay visible (guardrails file); the rep fills them before sending.
  await draft.fill((await draft.inputValue()).replace(/\{[^}]*\}/g, "research"));
  await rep.getByRole("button", { name: "Mark as sent" }).click();
  await expect(shown(rep.getByText("Logged as sent."))).toBeVisible();
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
  // The 2 replies, plus the earlier lead who now needs a follow-up date (D-044).
  await expect(ranked.getByRole("listitem")).toHaveCount(3);
  await expect(ranked.getByText(/^Ranked: /).first()).toBeVisible();
  await rep.screenshot({ path: "test-results/r6-today.png", fullPage: true });

  await rep.getByRole("button", { name: "Done: Mark replied for Bilal Khan" }).click();
  // Answered: Bilal now needs a next follow-up date (D-044). Set it, and he leaves Today.
  await shown(rep.getByRole("button", { name: "Set next follow-up for Bilal Khan" })).click();
  const next = rep.getByRole("dialog");
  await next.getByLabel("Next action").fill("Check in after their budget review");
  await next.getByRole("button", { name: "Save next follow-up" }).click();
  await expect(rep.getByRole("listitem", { name: "Bilal Khan" })).toHaveCount(0);

  await rep.getByRole("button", { name: "Snooze Chitra Rao" }).click();
  await rep
    .getByRole("dialog")
    .getByRole("button", { name: /^Snooze to / })
    .click();
  await expect(rep.getByRole("listitem", { name: "Chitra Rao" })).toHaveCount(0);
});
