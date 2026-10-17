// The R6 exit check from the PRD, automated with the stand-in AI (AI_FAKE, so no real API
// calls): a pasted reply returns a reply type, 2–3 suggestions and a stage suggestion; Today
// ranks a real rep's list. Plus summarise and draft.
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
  await d.getByLabel("Company").fill("Insight Co R6");
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
  // The AI needs Product Facts.
  await admin.goto("/settings/product-facts");
  await admin.getByRole("button", { name: "Edit" }).click();
  const d = admin.getByRole("dialog");
  await d.getByLabel("What Lumor does").fill("An AI research assistant for insight teams.");
  await d.getByLabel("Live features").fill("Survey analysis");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(d).toBeHidden();

  rep = await newPage(browser);
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("exit check: a pasted reply gets a reply type, 2–3 suggestions and a stage suggestion", async () => {
  await addLead("Asha Verma", "asha-verma-r6");
  await rep.getByLabel("Prospect's message").fill("Sounds interesting. How does it work?");
  await rep.getByRole("button", { name: "Suggest replies" }).click();
  await expect(rep.getByLabel("Reply type")).toHaveValue("Interested");
  const cards = rep.getByLabel(/^Reply: /);
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveValue(/20-minute demo/);
  await expect(rep.getByText("Suggested next step")).toBeVisible();
  await rep.screenshot({ path: "test-results/r6-assistant.png", fullPage: true });
  await expect(rep.locator("dl").getByText("Replied", { exact: true })).toBeVisible();

  // The rep edits a suggestion lightly and marks it as sent.
  await cards.first().fill((await cards.first().inputValue()) + " Thanks!");
  await rep.getByRole("button", { name: "Mark as sent" }).first().click();
  await expect(shown(rep.getByText("Logged as sent."))).toBeVisible();
  await rep.getByRole("button", { name: "Confirm" }).click();
  await expect(shown(rep.getByText("Next step saved."))).toBeVisible();
  await rep.reload();
  await expect(shown(rep.getByText("Sounds interesting. How does it work?"))).toBeVisible();
  await expect(shown(rep.getByText(/Thanks!$/))).toBeVisible();
});

test("summarise a thread and save it as a note; draft from a template", async () => {
  await rep.goto(leadUrls[0]);
  await rep.getByRole("tab", { name: "Summarise conversation" }).click();
  await rep
    .getByLabel("LinkedIn conversation")
    .fill("Me: Hi Asha\nAsha: Interested, worried about setup.");
  await rep.getByRole("button", { name: "Summarise" }).click();
  await expect(rep.getByText(/Asha Verma is interested/)).toBeVisible();
  await rep.getByRole("button", { name: "Save as note" }).click();
  await expect(shown(rep.getByText("Saved as a note."))).toBeVisible();

  await rep.getByRole("tab", { name: "Draft message" }).click();
  await rep.getByLabel("Template").selectOption({ index: 1 });
  await rep.getByRole("button", { name: "Draft", exact: true }).click();
  const draft = rep.getByLabel("Message", { exact: true });
  await expect(draft).not.toHaveValue("");
  await expect(draft).not.toHaveValue(/\{/);
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
  await expect(shown(rep.getByText(/0 of 20 requests sent/))).toBeVisible();

  await rep.getByRole("button", { name: "Rank with AI" }).click();
  await expect(shown(rep.getByRole("region", { name: "Your week" }))).toContainText(
    "requests this week",
  );
  const ranked = shown(rep.getByRole("list", { name: "Ranked tasks" }));
  await expect(ranked.getByRole("listitem")).toHaveCount(2);
  await expect(ranked.getByText(/^Ranked: /).first()).toBeVisible();
  await rep.screenshot({ path: "test-results/r6-today.png", fullPage: true });

  await rep.getByRole("button", { name: "Done: Mark replied for Bilal Khan" }).click();
  await expect(ranked.getByRole("listitem")).toHaveCount(1);
  await rep.getByRole("button", { name: "Snooze Chitra Rao to tomorrow" }).click();
  await expect(shown(rep.getByText("Nothing due. Time for new outreach."))).toBeVisible();
});
