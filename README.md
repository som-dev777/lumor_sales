# Lumor Sales Hub

Internal web app for Lumor's sales team to manage LinkedIn prospecting.

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Full documentation and feature index: [docs/README.md](docs/README.md)
- Rules for Claude Code sessions: [CLAUDE.md](CLAUDE.md)

## Run it on your computer

First time only: copy `.env.example` to `.env.local` and fill in the values.

```bash
npm install          # install packages
npm run db:migrate   # create or update the database (data/app.db)
npm run seed:admin   # first time only: create the default Admins (password from .env.local)
npm run dev          # start the app
```

Then open http://localhost:3000.

## Other commands

| Command                         | What it does                                                |
| ------------------------------- | ----------------------------------------------------------- |
| `npm test`                      | Run the automated tests                                     |
| `npm run typecheck`             | Check the code for type mistakes                            |
| `npm run lint`                  | Check the code for common mistakes                          |
| `npm run format`                | Tidy the formatting of every file                           |
| `npm run db:generate`           | After a schema change: write the new migration file         |
| `npm run db:studio`             | Open a browser view of the database (read and edit data)    |
| `npm run releases:sync`         | Copy released versions from the CHANGELOG to the About page |
| `npm run audit:check-lock`      | Prove the Audit Log can't be edited or deleted              |
| `npm run seed:admin -- --reset` | Default Admin locked out: restore the starting password     |
