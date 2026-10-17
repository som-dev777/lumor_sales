// The R4 exit check from the PRD, automated: one lead walked from Request sent to Paid moves
// through every stage with the quick-log buttons, and the dashboard counts it at every stage.
import { expect, test, type Locator, type Page } from "@playwright/test";

const REP = { name: "Tara Rep", email: "tara@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let rep: Page;
let personUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const stage = (page: Page) =>
  page.locator("dl").getByText("Stage").locator("xpath=following-sibling::dd[1]");

async function log(page: Page, button: string, expected: string) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await expect(stage(page)).toHaveText(expected);
}

async function logWithDialog(
  page: Page,
  button: string,
  fill: (d: Locator) => Promise<void>,
  expected: string,
) {
  await page.getByRole("button", { name: button, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await fill(dialog);
  await dialog.getByRole("button", { name: "Log it" }).click();
  await expect(dialog).toBeHidden();
  await expect(stage(page)).toHaveText(expected);
}

test.beforeAll(async ({ browser }) => {
  rep = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("exit check: one lead walked from Request sent to Paid", async () => {
  await rep.goto("/people");
  await rep.getByRole("button", { name: "Add person" }).click();
  const add = rep.getByRole("dialog");
  await add.getByLabel("Full name").fill("Dev Walker");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/dev-walker-r4");
  await add.getByLabel("Company").fill("Zen Labs R4");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(rep.url()).pathname;

  await log(rep, "Request sent", "Request sent");
  await expect(rep.getByText("Check acceptance ·")).toBeVisible();
  await log(rep, "Accepted", "Connected");
  await logWithDialog(rep, "Message 1 sent", async () => {}, "Messaged");
  await expect(rep.locator("dl").getByText("Send Follow-up 1 ·")).toBeVisible();
  await log(rep, "Follow-up 1 sent", "Messaged");
  await expect(rep.getByRole("button", { name: "Follow-up 2 sent" })).toBeVisible();
  await logWithDialog(
    rep,
    "Got a reply",
    (d) =>
      d
        .getByLabel("Reply type")
        .selectOption("Interested")
        .then(() => {}),
    "Replied",
  );
  await logWithDialog(rep, "Demo booked", async () => {}, "Demo booked");
  await log(rep, "Demo held", "Demo done");

  // Trial/Pilot is set from Edit (PRD), not a quick-log button.
  await rep.getByRole("button", { name: "Edit" }).click();
  const edit = rep.getByRole("dialog");
  await edit.getByLabel("Stage").selectOption("Trial/Pilot");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(edit).toBeHidden();
  await expect(stage(rep)).toHaveText("Trial/Pilot");

  await log(rep, "Mark converted", "Paid");
  await expect(rep.getByText("Mark Zen Labs R4 as a customer too?")).toBeVisible();
  await rep.screenshot({ path: "test-results/r4-person.png", fullPage: true });
});

test("the dashboard counts the lead once at every stage", async () => {
  await rep.goto("/dashboard?by=rep");
  await expect(rep.getByRole("heading", { name: "Funnel" })).toBeVisible();
  const row = rep.getByRole("row", { name: /^Tara Rep/ });
  // Requests, Accepted, Replied, Interested, Demo booked, Demo held, Trial, Paid
  await expect(row.getByRole("cell")).toHaveText([
    "1",
    "1",
    "1",
    "1",
    "1",
    "1",
    "1",
    "1",
    /low sample/,
    /low sample/,
    /low sample/,
    /low sample/,
    /low sample/,
  ]);
  await rep.screenshot({ path: "test-results/r4-dashboard.png", fullPage: true });
  await rep.goto("/dashboard?period=month&by=rep");
  await expect(
    rep
      .getByRole("row", { name: /^Tara Rep/ })
      .getByRole("cell")
      .first(),
  ).toHaveText("1");
});

test("the customer prompt marks the company as a customer", async () => {
  await rep.goto(personUrl);
  await rep.getByRole("button", { name: "Mark as customer" }).click();
  const d = rep.getByRole("dialog");
  await d.getByLabel("Plan or tier").fill("Team");
  await d.getByLabel("Deal value (₹)").fill("120000");
  await d.getByRole("button", { name: "Mark as customer" }).click();
  await expect(d).toBeHidden();
  await expect(rep.getByText("as a customer too?")).toBeHidden();
});

test("a lost lead needs a reason", async () => {
  await rep.goto("/people");
  await rep.getByRole("button", { name: "Add person" }).click();
  const add = rep.getByRole("dialog");
  await add.getByLabel("Full name").fill("Lost Lead");
  await add.getByLabel("LinkedIn profile link").fill("linkedin.com/in/lost-lead-r4");
  await add.getByRole("button", { name: "Add person" }).click();
  await expect(rep).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  await rep.getByRole("button", { name: "Mark lost" }).click();
  const d = rep.getByRole("dialog");
  await d.getByRole("button", { name: "Log it" }).click();
  await expect(d.getByText("Choose a reason.")).toBeVisible();
  await d.getByLabel("Lost reason").selectOption("No budget");
  await d.getByRole("button", { name: "Log it" }).click();
  await expect(stage(rep)).toHaveText("Lost");
});
