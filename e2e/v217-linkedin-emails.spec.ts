// v2.17.0 exit check (F30, D-066): the follow-up sprint has the LinkedIn emails panel (here Google
// isn't set up, so it says so), and a reply with no reply type shows as Answer the reply, with a
// reply drafted. Reading Gmail itself is checked with Gmail faked in
// src/server/google/linkedin-mail.test.ts.
import { expect, test, type Locator, type Page } from "@playwright/test";

const RIA = { name: "Ria Replies", email: "ria@lumor.tech", password: "rep-password-217" };

test.describe.configure({ mode: "serial" });

let ria: Page;
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

test.beforeAll(async ({ browser }) => {
  ria = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await ria.goto("/signup");
  await shown(ria.getByLabel("Full name")).fill(RIA.name);
  await shown(ria.getByLabel("Work email")).fill(RIA.email);
  await shown(ria.getByLabel("Password", { exact: true })).fill(RIA.password);
  await shown(ria.getByLabel("Confirm password")).fill(RIA.password);
  await ria.getByRole("button", { name: "Create account" }).click();
  await expect(ria).toHaveURL("/");
});

test("exit check: a reply with no type shows as Answer the reply; the LinkedIn emails panel shows", async () => {
  await ria.goto("/people");
  await shown(ria.getByRole("button", { name: "Add person" })).click();
  const add = ria.getByRole("dialog");
  await add.getByLabel("Full name").fill("Kabir Answer");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/kabir-answer-v217");
  await add.getByLabel("Company").selectOption({ label: "+ Add a new company" });
  await add.getByLabel("New company name").fill("Answer Labs");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(ria).toHaveURL(/\/people\/[0-9a-f-]{36}$/);

  // Kabir wrote back (as Gmail logs it: no reply type).
  const convo = shown(ria.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "From Kabir" }).check();
  await convo.getByLabel("What Kabir sent or said").fill("Sounds useful. How does it work?");
  await convo.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(ria.getByText("Added to the conversation."))).toBeVisible();

  await ria.goto("/sprint?kind=follow");
  const emails = shown(ria.getByRole("region", { name: "LinkedIn emails" }));
  await expect(emails).toContainText("Google isn’t set up for this site yet");
  const card = ria.getByRole("article", { name: "Card: Kabir Answer" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Answer the reply");
  await expect(card).toContainText("They said: Sounds useful. How does it work?");
  await expect(ria.getByLabel("Message")).not.toHaveValue("");
  await ria.screenshot({ path: "test-results/v217-follow-up.png", fullPage: true });
});
