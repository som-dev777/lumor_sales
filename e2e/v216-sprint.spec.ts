// v2.16.0 exit check (F30, D-065): a rep pastes 3 profiles with Add many, runs a connection sprint
// (a note written for each, Sent ✓ on each card), and the follow-up sprint shows the 3 waiting
// for acceptance; Accepted moves one on.
import { expect, test, type Locator, type Page } from "@playwright/test";

const SAMI = { name: "Sami Sprint", email: "sami@lumor.tech", password: "rep-password-216" };

test.describe.configure({ mode: "serial" });

let sami: Page;
const shown = (locator: Locator) => locator.filter({ visible: true }).first();

test.beforeAll(async ({ browser }) => {
  sami = await (await browser.newContext({ viewport: { width: 1280, height: 1000 } })).newPage();
  await sami.goto("/signup");
  await shown(sami.getByLabel("Full name")).fill(SAMI.name);
  await shown(sami.getByLabel("Work email")).fill(SAMI.email);
  await shown(sami.getByLabel("Password", { exact: true })).fill(SAMI.password);
  await shown(sami.getByLabel("Confirm password")).fill(SAMI.password);
  await sami.getByRole("button", { name: "Create account" }).click();
  await expect(sami).toHaveURL("/");
});

test("exit check: Add many adds 3 people from pasted profile links", async () => {
  await sami.goto("/people");
  await shown(sami.getByRole("button", { name: "Add many" })).click();
  const dialog = sami.getByRole("dialog");
  await dialog
    .getByLabel("People, one per line")
    .fill(
      [
        "linkedin.com/in/neha-sprint-v216, Neha Sprint",
        "https://www.linkedin.com/in/omar-sprint-v216/",
        "linkedin.com/in/lina-sprint-v216, Lina Sprint, Head of Research",
      ].join("\n"),
    );
  await dialog.getByLabel("Company for lines without one").fill("Sprint Labs");
  await dialog.getByRole("button", { name: "Add 3 people" }).click();
  await expect(dialog).toContainText("Added 3 people.");
  await expect(dialog.getByRole("link", { name: "start a connection sprint" })).toBeVisible();
});

test("exit check: the connection sprint writes a note for each and logs Sent ✓", async () => {
  await sami.goto("/");
  await shown(sami.getByRole("link", { name: "Start connection sprint" })).click();
  await expect(sami).toHaveURL("/sprint");
  await expect(shown(sami.getByRole("status").filter({ hasText: "sent today" }))).toContainText(
    "0 of 20 sent today · 0 of 100 this week",
  );
  const note = sami.getByLabel("Connection note");

  // The first card: a note over LinkedIn's 300 characters can't be sent.
  await expect(sami.getByRole("article", { name: "Card: Neha Sprint" })).toBeVisible();
  await expect(note).toHaveValue(/Hi Neha/);
  const written = await note.inputValue();
  await note.fill("x".repeat(301));
  await expect(sami.getByText("301 / 300 characters")).toBeVisible();
  await expect(sami.getByRole("button", { name: "Sent ✓" })).toBeDisabled();
  await note.fill(written);
  await sami.screenshot({ path: "test-results/v216-card.png", fullPage: true });
  await expect(sami.getByRole("link", { name: "Open profile" })).toHaveAttribute(
    "href",
    "https://linkedin.com/in/neha-sprint-v216",
  );
  await sami.getByRole("button", { name: "Sent ✓" }).click();

  for (const name of ["Omar Sprint", "Lina Sprint"]) {
    await expect(sami.getByRole("article", { name: `Card: ${name}` })).toBeVisible();
    await expect(note).toHaveValue(new RegExp(`Hi ${name.split(" ")[0]}`));
    await sami.getByRole("button", { name: "Sent ✓" }).click();
  }
  await expect(sami.getByText("All done for this sprint.")).toBeVisible();
  await expect(shown(sami.getByRole("status").filter({ hasText: "sent today" }))).toContainText(
    "3 of 20 sent today · 3 of 100 this week",
  );
  await sami.screenshot({ path: "test-results/v216-sprint.png", fullPage: true });
});

test("exit check: the follow-up sprint shows the 3 waiting; Accepted moves one on", async () => {
  await sami.goto("/sprint?kind=follow");
  const waiting = shown(sami.getByRole("region", { name: "Waiting for acceptance" }));
  await expect(waiting).toContainText("Waiting for acceptance (3)");
  for (const name of ["Neha Sprint", "Omar Sprint", "Lina Sprint"]) {
    await expect(waiting).toContainText(name);
  }
  await waiting.getByRole("button", { name: "Neha Sprint accepted" }).click();
  await expect(waiting).toContainText("Waiting for acceptance (2)");

  // Neha's page: on the Official Outreach plan, past the request.
  await sami.goto("/people");
  await shown(sami.getByRole("link", { name: "Neha Sprint" })).click();
  const panel = shown(sami.getByRole("region", { name: "Plan" }));
  await expect(panel).toContainText("Step 2 of 5: LinkedIn message");
  await expect(sami.getByText("Hi Neha").first()).toBeVisible();
});
