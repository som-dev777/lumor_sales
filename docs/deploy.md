# Putting Lumor Sales Hub online

This guide is for the owner. You create two free accounts (Turso for the database, Netlify
for the website) and paste a few values. Nothing here is done automatically: the app goes
online only when you click Deploy.

Time needed: about 30 minutes. Do the steps in order.

## What you'll end up with

- A database in Mumbai (Turso), which holds all the app's data.
- The website (Netlify), at an address like `https://lumor-sales.netlify.app`.
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

   | Name                  | Value                                                                 |
   | --------------------- | --------------------------------------------------------------------- |
   | `DATABASE_URL`        | the Turso URL from Step 1 (`libsql://…`)                              |
   | `DATABASE_AUTH_TOKEN` | the Turso token from Step 1                                           |
   | `BETTER_AUTH_SECRET`  | the key from Step 2                                                   |
   | `BETTER_AUTH_URL`     | the site address, e.g. `https://lumor-sales.netlify.app` (see step 7) |
   | `SEED_ADMIN_PASSWORD` | the first password for the three default Admins (10+ characters)      |
   | `RESEND_API_KEY`      | from Step 3 (leave out if you skipped it)                             |
   | `EMAIL_FROM`          | from Step 3 (leave out if you skipped it)                             |
   | `OPENAI_API_KEY`      | for the AI features: platform.openai.com → API keys. Optional.        |
   | `OPENAI_MODEL`        | optional: another OpenAI model than the default `gpt-5.5`             |

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
