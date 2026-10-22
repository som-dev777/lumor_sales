// The AI Resources exit check (F20, v2.1.0), automated: the starting knowledge base is there; an
// Admin edits a file (version 2), uploads a small PDF and adds a video link; a User reads the
// files and downloads the PDF but can't edit or add anything.
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };
const REP = { name: "Usha Rep", email: "usha@lumor.tech", password: "rep-password-12" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let rep: Page;

const shown = (locator: Locator) => locator.filter({ visible: true }).first();

async function newPage(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return context.newPage();
}

// A tiny but real PDF, well under the 5 MB limit.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test.beforeAll(async ({ browser }) => {
  admin = await newPage(browser);
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");

  rep = await newPage(browser);
  await rep.goto("/signup");
  await shown(rep.getByLabel("Full name")).fill(REP.name);
  await shown(rep.getByLabel("Work email")).fill(REP.email);
  await shown(rep.getByLabel("Password", { exact: true })).fill(REP.password);
  await shown(rep.getByLabel("Confirm password")).fill(REP.password);
  await rep.getByRole("button", { name: "Create account" }).click();
  await expect(rep).toHaveURL("/");
});

test("the sidebar opens AI Resources with the 8 starting knowledge files, guardrails last", async () => {
  await shown(admin.getByRole("link", { name: "AI Resources" })).click();
  await expect(admin).toHaveURL(/\/ai-resources$/);
  const cards = admin.locator("a[href^='/ai-resources/knowledge/']").filter({ visible: true });
  await expect(cards).toHaveCount(8);
  await expect(cards.last()).toContainText("AI guardrails");
  await expect(cards.last()).toContainText("Placed last");
});

test("an Admin edits a knowledge file and it becomes version 2, with the old text kept", async () => {
  await shown(admin.getByRole("link", { name: "AI guardrails" })).click();
  await expect(admin).toHaveURL(/\/ai-resources\/knowledge\//);
  await shown(admin.getByRole("button", { name: "Edit" })).click();
  const text = shown(admin.getByLabel("Text (Markdown)"));
  await text.fill(`${await text.inputValue()}\n\n- Test rule added by the browser test.`);
  await admin.getByRole("button", { name: "Save", exact: true }).click();
  await expect(shown(admin.getByText("AI guardrails saved (version 2)."))).toBeVisible();
  await admin.reload();
  await expect(shown(admin.getByText("Test rule added by the browser test."))).toBeVisible();
  await expect(
    shown(admin.getByRole("region", { name: "Earlier versions", exact: true })),
  ).toContainText("Version 1");
});

test("an Admin uploads a PDF deck and adds a product video link", async () => {
  await admin.goto("/ai-resources?tab=sales");
  await shown(admin.getByRole("button", { name: "Add resource" })).click();
  await shown(admin.getByLabel("Title")).fill("Lumor overview deck");
  await shown(admin.getByLabel("Category")).selectOption("Sales deck");
  await shown(admin.getByLabel(/^File \(PDF/)).setInputFiles({
    name: "lumor-overview.pdf",
    mimeType: "application/pdf",
    buffer: PDF,
  });
  await admin.getByRole("button", { name: "Upload" }).click();
  await expect(shown(admin.getByText("Lumor overview deck uploaded."))).toBeVisible();

  await shown(admin.getByRole("button", { name: "Add resource" })).click();
  await shown(admin.getByText("Add a link")).click();
  await shown(admin.getByLabel("Title")).fill("Two-minute product tour");
  await shown(admin.getByLabel("Category")).selectOption("Product video");
  await shown(admin.getByLabel("Link", { exact: true })).fill(
    "https://www.loom.com/share/lumor-tour",
  );
  await admin.getByRole("button", { name: "Add link" }).click();
  await expect(shown(admin.getByText("Two-minute product tour added."))).toBeVisible();

  await admin.reload();
  await expect(shown(admin.getByRole("region", { name: "Sales deck", exact: true }))).toContainText(
    "lumor-overview.pdf",
  );
  await expect(
    shown(admin.getByRole("region", { name: "Product video", exact: true })),
  ).toContainText("Link · www.loom.com");
});

test("exit check: a User reads the knowledge and downloads the deck, but can't edit or add", async () => {
  await rep.goto("/ai-resources");
  await expect(
    rep.locator("a[href^='/ai-resources/knowledge/']").filter({ visible: true }),
  ).toHaveCount(8);
  await expect(rep.getByRole("button", { name: "Add knowledge file" })).toHaveCount(0);
  await shown(rep.getByRole("link", { name: "AI guardrails" })).click();
  await expect(shown(rep.getByText("Test rule added by the browser test."))).toBeVisible();
  await expect(rep.getByRole("button", { name: "Edit" })).toHaveCount(0);

  await rep.goto("/ai-resources?tab=sales");
  await expect(rep.getByRole("button", { name: "Add resource" })).toHaveCount(0);
  await expect(rep.getByRole("button", { name: /^Remove / })).toHaveCount(0);
  const download = rep.waitForEvent("download");
  await shown(rep.getByRole("link", { name: "Download Lumor overview deck" })).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("lumor-overview.pdf");
  await expect(
    shown(rep.getByRole("link", { name: "Open Two-minute product tour" })),
  ).toHaveAttribute("href", "https://www.loom.com/share/lumor-tour");
});
