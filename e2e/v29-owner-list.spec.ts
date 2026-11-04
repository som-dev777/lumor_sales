// v2.9.0 exit check (D-055): a Follow-up set from the conversation shows on Today; a call logged
// on the person's page clears it from Today straight away; Companies and People sort A–Z with a
// slim filter bar; the AI chat has the LinkedIn-acceptance question and the mic. AI runs in fake
// mode.
import { expect, test, type Locator, type Page } from "@playwright/test";

const ADMIN = { email: "somnath@lumor.tech", password: "e2e-admin-password" };

test.describe.configure({ mode: "serial" });

let admin: Page;
let personUrl = "";

const shown = (locator: Locator) => locator.filter({ visible: true }).first();
const todayIst = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await admin.goto("/login");
  await shown(admin.getByLabel("Email")).fill(ADMIN.email);
  await shown(admin.getByLabel("Password")).fill(ADMIN.password);
  await admin.getByRole("button", { name: "Log in" }).click();
  await expect(admin).toHaveURL("/");

  // A company and a person to work on.
  await admin.goto("/companies");
  await shown(admin.getByRole("button", { name: "Add company" })).click();
  let dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Company name").fill("Aardvark Analytics");
  await dialog.getByRole("button", { name: "Add company" }).click();
  await expect(admin).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
  await shown(admin.getByRole("button", { name: "Add person" })).click();
  dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("Fiona Follow");
  await dialog.getByLabel("LinkedIn profile link").fill("linkedin.com/in/fiona-follow-v29");
  await dialog.getByRole("button", { name: "Add person" }).click();
  await expect(admin).toHaveURL(/\/people\/[0-9a-f-]{36}$/);
  personUrl = new URL(admin.url()).pathname;
});

test("exit check: Follow-up from the conversation shows on Today", async () => {
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "Follow-up" }).check();
  await convo.getByLabel("Next action").fill("Call about the pilot");
  await convo.getByLabel("Follow-up date").fill(todayIst());
  await convo.getByLabel("Note (optional)").fill("She asked for a call this week");
  await convo.getByRole("button", { name: "Set follow-up" }).click();
  await expect(shown(admin.getByText(/Follow-up set: Call about the pilot/))).toBeVisible();
  await expect(convo).toContainText("She asked for a call this week");
  await expect(admin.locator("dl").first()).toContainText("Call about the pilot");

  await shown(admin.getByRole("link", { name: "Today" })).click();
  await expect(admin).toHaveURL("/");
  const task = shown(admin.getByRole("listitem", { name: "Fiona Follow" }));
  await expect(task).toContainText("Call about the pilot");
});

test("exit check: a call logged on their page clears it from Today at once", async () => {
  const task = shown(admin.getByRole("listitem", { name: "Fiona Follow" }));
  await task.getByRole("link", { name: "Open" }).click();
  await expect(admin).toHaveURL(personUrl);
  const convo = shown(admin.getByRole("region", { name: "Conversation" }));
  await convo.getByRole("radio", { name: "From me" }).check();
  await convo.getByLabel("Channel").selectOption("Call");
  await convo.getByLabel("What you sent or said").fill("Called her about the pilot");
  await convo.getByRole("button", { name: "Add to conversation" }).click();
  await expect(shown(admin.getByText("Added to the conversation."))).toBeVisible();
  // Back to Today (the page Next.js kept is fetched again): she's gone.
  await admin.goBack();
  await expect(admin).toHaveURL("/");
  await expect(shown(admin.getByRole("region", { name: "Today's meetings" }))).toBeVisible();
  await expect(admin.getByRole("listitem", { name: "Fiona Follow" })).toHaveCount(0);
  await admin.reload();
  await expect(admin.getByRole("listitem", { name: "Fiona Follow" })).toHaveCount(0);
});

test("exit check: Companies and People sort A–Z, with a slim filter bar", async () => {
  await admin.goto("/companies");
  const bar = shown(admin.getByRole("form", { name: "Search, sort and filter" }));
  await expect(bar.getByLabel("Sort by")).toHaveValue("name");
  await expect(shown(admin.getByRole("columnheader", { name: "Last activity" }))).toBeVisible();
  // The filters stay folded away until asked for.
  await expect(bar.getByLabel("Needs action")).toBeHidden();
  await bar.getByLabel("Sort by").selectOption("name_desc");
  await expect(admin).toHaveURL(/sort=name_desc/);
  await shown(admin.getByRole("button", { name: "Filters" })).click();
  await shown(admin.getByLabel("Needs action")).selectOption("nopeople");
  await expect(admin).toHaveURL(/show=nopeople/);
  const chips = shown(admin.getByRole("list", { name: "Filters on" }));
  await expect(chips).toContainText("Needs action: No people yet");
  await expect(admin.getByRole("link", { name: "Aardvark Analytics" })).toHaveCount(0);
  await chips.getByRole("link", { name: /Needs action/ }).click();
  await expect(admin).not.toHaveURL(/show=/);
  // The box shows what's applied again.
  await expect(shown(admin.getByLabel("Needs action"))).toHaveValue("");
  await expect(shown(admin.getByRole("link", { name: "Aardvark Analytics" }))).toBeVisible();
  await admin.screenshot({ path: "test-results/v29-companies.png", fullPage: true });

  await admin.goto("/people");
  await expect(shown(admin.getByLabel("Sort by"))).toHaveValue("name");
  await shown(admin.getByRole("button", { name: "Filters" })).click();
  await shown(admin.getByLabel("Activity")).selectOption("recent");
  await expect(admin).toHaveURL(/activity=recent/);
  await expect(shown(admin.getByRole("link", { name: "Fiona Follow" }))).toBeVisible();
  await admin.screenshot({ path: "test-results/v29-people.png", fullPage: true });
});

test("exit check: the AI chat has the LinkedIn-acceptance question and the mic", async () => {
  await admin.goto(personUrl);
  await expect(
    shown(admin.getByRole("button", { name: "They accepted my LinkedIn request: first message?" })),
  ).toBeVisible();
  await expect(shown(admin.getByRole("button", { name: "Speak instead of typing" }))).toBeVisible();
});
