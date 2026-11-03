# Putting Lumor Sales Hub online

This guide is for the owner. You create two free accounts (Turso for the database, Netlify
for the website) and paste a few values. Nothing here is done automatically: the app goes
online only when you click Deploy.

Time needed: about 30 minutes. Do the steps in order.

## What you'll end up with

- A database in Mumbai (Turso), which holds all the app's data.
- The website (Netlify), at an address like `https://your-site-url.com`.
- Every time new code is pushed to GitHub (`main`), Netlify rebuilds and updates the site.
  Each build brings the database up to date first.

## Step 1: Create the database (Turso)

1. Go to https://turso.tech and click **Sign up**. Sign in with GitHub (easiest).
2. In the dashboard, click **Create Database**.
   - Name: `lumor-sales`
   - Location: **Mumbai (aws-ap-south-1)**. If Mumbai isn't listed, pick the closest one in Asia.
   - Click **Create Database**.
3. Open the new database. Copy its **URL** (it starts with `libsql://`). Paste it somewhere
   safe for a moment, e.g. a note on your computer (not in a chat or email).
4. On the same page, click **Create Token** (or **Generate Token**). Choose
   **Read & Write** and **no expiration**. Copy the long token next to the URL.
   Treat it like a password.

## Step 2: Make a secret key for logins

On your Mac, open Terminal (in Cursor: **Terminal → New Terminal**) and run:

```
openssl rand -base64 32
```

Copy the line it prints. This is `BETTER_AUTH_SECRET`. Use a new one for production; don't
reuse the one in your `.env.local`.

## Step 3: Email (Resend), recommended before inviting the team

Without this, the app still works: Admins copy invite and reset links and send them
themselves, and new sign-ups can log in straight away. With it, links are emailed, and new
@lumor.tech sign-ups must confirm their email first.

1. Go to https://resend.com and sign up.
2. **Domains → Add Domain**: enter `lumor.tech` and follow the instructions to add the DNS
   records it shows at your domain provider. Wait until it says **Verified**.
3. **API Keys → Create API Key**: name it `lumor-sales-hub`, permission **Sending access**.
   Copy the key (it starts with `re_`).
4. Decide the sender, e.g. `Lumor Sales Hub <sales-hub@lumor.tech>`. This is `EMAIL_FROM`.

## Step 4: Create the website (Netlify)

1. Go to https://app.netlify.com and sign up with GitHub.
2. Click **Add new site → Import an existing project → GitHub**.
3. Allow Netlify to see the **som-dev777/lumor_sales** repository and pick it.
4. Netlify reads the settings from `netlify.toml` in the code. Leave the build settings as
   they are.
5. Before deploying, open **Add environment variables** (or after creating the site:
   **Site configuration → Environment variables → Add a variable**) and add each of these:

   | Name                  | Value                                                                |
   | --------------------- | -------------------------------------------------------------------- |
   | `DATABASE_URL`        | the Turso URL from Step 1 (`libsql://…`)                             |
   | `DATABASE_AUTH_TOKEN` | the Turso token from Step 1                                          |
   | `BETTER_AUTH_SECRET`  | the key from Step 2                                                  |
   | `BETTER_AUTH_URL`     | the site address, e.g. `https://your-site-url.com` (see step 7)      |
   | `SEED_ADMIN_PASSWORD` | the first password for the three default Admins (10+ characters)     |
   | `RESEND_API_KEY`      | from Step 3 (leave out if you skipped it)                            |
   | `EMAIL_FROM`          | from Step 3 (leave out if you skipped it)                            |
   | `OPENAI_API_KEY`      | for the AI features: platform.openai.com → API keys. Optional.       |
   | `OPENAI_MODEL`        | optional: another OpenAI model than the default `gpt-5.5`            |
   | `CRON_SECRET`         | for scheduled reports: run `openssl rand -base64 32`, paste the line |

6. Click **Deploy**. The first build takes a few minutes. It creates the tables, the three
   default Admins, the starting library, the seed plans and the AI knowledge files.
7. When it's done, Netlify shows the site's address. If it differs from what you put in
   `BETTER_AUTH_URL` (you can rename the site under **Site configuration → Change site
   name**), update `BETTER_AUTH_URL` to the exact address, then **Deploys → Trigger deploy →
   Deploy site**.

## Step 5: First login

1. Open the site and log in as `somnath@lumor.tech` with `SEED_ADMIN_PASSWORD`.
2. Click **Change password** (bottom left) and set your own password. Ask Arijeet and Prince
   to do the same as soon as they first log in.
3. Go through `docs/qa-checklist.md` on the live site.

## Keeping keys safe

Paste API keys only into Netlify's environment variables (and `.env.local` on your Mac).
Never send them by chat or email. If a key has been shared anywhere else, create a new one
(OpenAI: platform.openai.com → API keys → Create new secret key), put it in Netlify and
`.env.local`, then delete the old key there.

## Before upgrading to a new version

Each deploy updates the database first. For a big upgrade (like v2.0.0, which renames stages),
make a copy of the production database first, in Terminal:

```
turso db create lumor-sales-backup-2026-10 --from-db lumor-sales
```

(Install the Turso command first: `brew install tursodatabase/tap/turso`, then `turso auth
login`.) On your own Mac, `npm run db:migrate` copies `data/app.db` into `data/backups/` by
itself before changing anything.

## Scheduled reports and booking reminders

Netlify runs `netlify/functions/report-schedules.mts` every 15 minutes. It calls the app with
`CRON_SECRET`, and the app makes the reports that are due (Reports page → Scheduled reports)
and emails the booking reminders that are due (24 hours and 1 hour before, D-043).
Without `CRON_SECRET` nothing runs on a schedule (Run now still works, but no reminders go out). Without the Resend key,
scheduled reports are saved in Report history but not emailed. To check it's running: Netlify →
**Logs → Functions → report-schedules**.

## Speed: keep the database and the site close

Every page reads the database several times. If the database (Turso, Mumbai) and the site's
functions (Netlify) are on different continents, each read crosses the world and pages feel
slow. Two fixes, either is enough:

- **Netlify:** Project configuration → **Build & deploy → Functions region** → choose
  **Asia Pacific (Mumbai)** if your plan offers it, then **Trigger deploy**.
- **Or Turso:** create the database in the same region as Netlify's functions (shown on that
  same Netlify page), copy the data across (`turso db create lumor-sales-us --from-db
lumor-sales --location <region>`), and update `DATABASE_URL` and `DATABASE_AUTH_TOKEN`.

## Booking links (Calendar, F22)

Booking links use the site address in `BETTER_AUTH_URL` (for example
`https://your-site.netlify.app/book/somnath/demo`), so it must be the live address. Booking
emails and calendar invites go through Resend (`RESEND_API_KEY`, `EMAIL_FROM`); without them,
bookings still work, but nobody is emailed (no confirmation, no reminders, no rep email). Each rep
sets where their own booking emails go on Calendar → Availability (it starts as their login email),
and their title for the emails ("Co-founder, Lumor").

**Checklist when bookings don't email anyone:** on Netlify → Project configuration → Environment
variables, `RESEND_API_KEY` and `EMAIL_FROM` must both be set (and the sending domain verified in
Resend), then **Trigger deploy**. For reminders, `CRON_SECRET` must be set too.

## Email through a Gmail account (no domain needed, D-046)

Use this instead of Resend when you don't want to use your company domain.

1. Create a Gmail account for the Sales Hub (recommended), e.g. lumor.sales.hub@gmail.com.
2. Turn on **2-Step Verification**: myaccount.google.com → **Security** → **2-Step
   Verification** → follow the steps (a phone number is enough).
3. Make an **App Password**: go to **myaccount.google.com/apppasswords**, name it
   "Lumor Sales Hub", click **Create**, and copy the 16 letters (shown once).
4. Netlify → Environment variables: add `GMAIL_USER` = the Gmail address and
   `GMAIL_APP_PASSWORD` = the 16 letters. Optional: `EMAIL_FROM` = `Somnath at Lumor
<the Gmail address>` to choose the name people see.
5. **Deploys → Trigger deploy**. Then Calendar → Availability → **Send me a test email**.
6. The picture people see next to the email is that Gmail account's profile photo: sign in to
   it, click the round picture top right → the pencil → upload `public/lumor-icon-512.png`.

## Calendly (F27, optional)

Only needed if some bookings still happen on Calendly. Calendly's webhooks need a paid Calendly
plan (Standard or higher).

1. Make a signing key: any long random text (Terminal: `openssl rand -base64 32`). Keep it secret.
2. Netlify → Project configuration → Environment variables → **Add a variable**: key
   `CALENDLY_WEBHOOK_SIGNING_KEY`, value = that text (untick "Contains secret values" on the free
   plan; All scopes; Same value for all deploy contexts). Then **Deploys → Trigger deploy**.
3. In Calendly: **Integrations → API and webhooks → Personal access tokens → Create new token**.
   Copy it.
4. Create the webhook subscription (Calendly has no button for this; it's one request). In
   Terminal, replacing the three CAPITAL parts:

   ```sh
   curl -X POST https://api.calendly.com/webhook_subscriptions \
     -H "Authorization: Bearer YOUR_CALENDLY_TOKEN" -H "Content-Type: application/json" \
     -d '{"url":"https://YOUR-SITE.netlify.app/api/calendly/webhook",
          "events":["invitee.created","invitee.canceled"],
          "organization":"YOUR_ORGANIZATION_URI","scope":"organization",
          "signing_key":"THE_SIGNING_KEY_FROM_STEP_1"}'
   ```

   Your organization URI is in the answer to
   `curl -H "Authorization: Bearer YOUR_CALENDLY_TOKEN" https://api.calendly.com/users/me`
   (`current_organization`).

5. Book a test meeting on Calendly. The person appears in the Sales Hub (or gets Meeting booked)
   within a minute, and their owner gets an email.

## Google Calendar and Meet (F26, one-time setup)

With this set up, each rep can click **Connect Google Calendar** (Calendar → Availability). Then
every booking gets its own Google Meet link, lands in their Google Calendar, and their Google busy
times block booking slots. Until it's set up, the button says it isn't set up and everything else
works as before.

1. Go to <https://console.cloud.google.com>, sign in with the company Google account, and create a
   project (top bar → project picker → **New project**, name "Lumor Sales Hub").
2. **APIs & Services → Library**: search **Google Calendar API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (also called **Google Auth Platform**):
   - User type: **Internal** if everyone uses a company Google Workspace address (for example
     @lumor.tech): no Google review needed, and connections don't expire. Otherwise **External**,
     and add each rep's Google address under **Test users** (in testing mode Google asks reps to
     reconnect every 7 days, until you submit the app for Google's verification).
   - App name "Lumor Sales Hub", your support email, then save.
   - **Data access / Scopes → Add or remove scopes**: add `.../auth/calendar.events` and
     `.../auth/calendar.freebusy` (paste them in the "Manually add scopes" box), plus `openid`
     and `email`. Save.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, name "Lumor Sales Hub".
   - **Authorised redirect URIs → Add URI**: `https://YOUR-LIVE-SITE/api/google/callback` (the
     same address as `BETTER_AUTH_URL`, plus `/api/google/callback`). For trying it on your own
     computer, also add `http://localhost:3000/api/google/callback`.
   - **Create**. Copy the **Client ID** and **Client secret** (keep the secret private).
5. In Netlify → **Site configuration → Environment variables**, add `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` with those values, then **Deploys → Trigger deploy**. To use it locally
   too, put the same two lines in `.env.local` and restart `npm run dev`.
6. Each rep: Calendar → Availability → **Connect Google Calendar** → choose their account →
   **Allow**. They come back to "Connected as …".

The token Google returns is stored encrypted with `BETTER_AUTH_SECRET`; if you ever change that
secret, reps simply click Connect again.

## The logo and tab icon

Both use one file: `public/brand-icon.png` (a square PNG, ideally 512 × 512). To change it,
replace that file with the new icon (same name), commit and push; Netlify redeploys.

## Later

- **New code:** each push to `main` on GitHub redeploys the site automatically.
- **A key changed:** update it in Netlify's environment variables, then **Trigger deploy**.
- **Backups:** Turso keeps point-in-time backups. See the database's **Backups** tab in
  Turso.
- **Never** put these values in the code, in GitHub, or in chat. They live only in Netlify
  and in your own `.env.local`.

## If a build fails

Open **Deploys**, click the failed deploy and scroll to the red lines. Common causes:

- `DATABASE_URL is not set` (or similar): an environment variable is missing or misspelled.
- `SEED_ADMIN_PASSWORD must be at least 10 characters`: make it longer.
- A Turso error mentioning the token: create a new token (Step 1.4) and update
  `DATABASE_AUTH_TOKEN`.
- "Secrets scanning found secrets in build": Netlify found the value of one of your variables
  in the code. The site address in `BETTER_AUTH_URL` isn't secret, so add a variable
  `SECRETS_SCAN_OMIT_KEYS` with the value `BETTER_AUTH_URL` (Project configuration →
  Environment variables), then **Trigger deploy**. Real keys stay checked. If it names any
  other variable, tell Claude Code: that one may really have leaked.
