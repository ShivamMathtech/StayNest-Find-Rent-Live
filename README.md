# StayNest — Find. Rent. Live.

A complete rental discovery and property-viewing application inspired by the supplied StayNest mobile UI reference. Responsive React UI, authenticated backend API, persistent SQL data, tenant and landlord workflows, and an administrator console are delivered in **one Next.js project**.

**Deploy the frontend and backend together to one Vercel project and one URL.** PostgreSQL is a connected managed database; it is not stored in Vercel’s temporary filesystem. No separate Express server, backend deployment, CORS setup or frontend API URL is required.

## Start locally on Windows

1. Install **Node.js 22 or 24 LTS**.
2. Extract the ZIP fully. Open the inner `staynest` folder containing `package.json`.
3. Double-click `setup-windows.bat` and let it finish.
4. Double-click `start-windows.bat`.
5. Open **http://localhost:3000**. Keep the terminal open.

Or use any terminal:

```bash
npm ci
npm run setup
npm run dev
```

Linux/macOS: `bash start.sh` does the same setup and launch.

The local database initializes on first API request; the first load can take several seconds. It is an actual embedded PostgreSQL engine (PGlite), persisted in `.data/staynest`, not browser localStorage. Stop the server before running database maintenance commands. Do not run two local app processes against the same `.data` directory.

## Local demonstration accounts

| Role | Email | Password |
| --- | --- | --- |
| Tenant | `tenant@staynest.demo` | `StayNest!2026` |
| Landlord | `host@staynest.demo` | `StayNest!2026` |
| Administrator | `admin@staynest.demo` | `StayNest!2026` |

The sign-in page also provides demo account buttons in local development. Demo account creation is disabled on Vercel. Never copy the local database to a public environment. Set `LOCAL_DEMO=false` for a clean local instance before its first launch. Eight fictional sample homes and bundled illustrative photographs make the local demo immediately usable.

## What works

- Email/password registration and sign-in; tenant and landlord role selection.
- Secure cookie sessions, server-side logout, password changes, one-use password reset links.
- Browse and search properties; filter by type, rent, minimum bedrooms, amenities and reviewed hosts; sort and paginate results.
- Saved homes persisted per user.
- Property details, photo gallery, amenities, landlord profiles, map and external directions/commute options.
- Free property-viewing requests, availability, double-booking prevention, host confirmation/decline, cancellation and past-viewing completion.
- Downloadable calendar appointments.
- Private two-way messaging, read receipts and five-second polling while visible.
- Notifications and mark-all-read.
- Profile editing, support tickets and FAQ/privacy information.
- Reviews after completed viewings; one editable review per user/property.
- Landlord listing creation, editing, archiving and dashboard counts.
- Administrator publication, featured listings, manual landlord verification and ticket resolution.
- Loading, empty and error states; mobile bottom navigation; keyboard-focusable controls and modal dialogs.

## Deploy both parts together on Vercel

Follow **[docs/VERCEL.md](docs/VERCEL.md)**. The short version:

1. Push this folder’s contents to a Git repository and import it into Vercel.
2. Select **Next.js**. Root directory is the folder containing this `package.json`. Leave the output directory on its framework default.
3. Connect Neon or another PostgreSQL provider. Set `DATABASE_URL` to its pooled connection string and `SESSION_SECRET` to a unique random secret of at least 32 characters.
4. Put the same database URL in your local `.env.local`; run `npm run db:setup` once. Run `npm run db:admin` after setting `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` locally.
5. Deploy. Set `APP_URL` to the deployed origin for optional password reset emails, then redeploy after configuration changes.

Your UI is at `https://your-project.vercel.app` and the API is at `https://your-project.vercel.app/api/...`. The production database is the only separately managed service required for core functionality.

**This delivery does not create a Vercel project or database in your account.** The source is built and tested locally; account-specific deployment and provider credentials remain your setup step.

## Practical boundaries

| Feature | Behavior in this release |
| --- | --- |
| Rentals | Discover properties and book viewings; not a lease-signing or rent-collection system. |
| Payments | No card, M-Pesa or rent/deposit processing. Viewing requests are free. |
| Phone OTP / social sign-in | Not implemented; email/password authentication is fully functional. |
| Password reset | Local developer preview; on Vercel requires `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL`. No simulated email delivery. |
| Photos | Bundled demo assets or HTTPS URLs. For real uploads, host images separately and paste their URLs. No durable server filesystem uploads. |
| Maps | Leaflet map with OpenStreetMap tiles; directions open Google Maps. Internet required. No fabricated commute estimates. |
| Calling / referral earnings | Not implemented. No fake call screen or earnings balance. |
| Verification | Manual administrator flag; not automated identity or property ownership verification. |
| Messaging | Persistent polling, not WebSockets or push notifications. Latest 200 messages per thread are displayed. |
| Scale | Search paginates 24 homes; dashboards intentionally bound large query results. See architecture documentation before scaling further. |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development, default port 3000. |
| `npm run dev -- --port 3001` | Start on another port. |
| `npm run build` | Build production frontend and API. No database connection required during build. |
| `npm start` | Serve the built application. |
| `npm run setup` | Create `.env.local` with a random session secret, without overwriting existing values. |
| `npm run db:setup` | Apply the initial idempotent schema to the configured database. |
| `npm run db:seed` | Insert sample listings; remote sample host has a random unknown password. |
| `npm run db:admin` | Create/update your admin using local environment variables. |
| `npm run typecheck` | TypeScript check. |
| `npm test` | Validation/security unit tests. |
| `npm run test:api` | Request/response integration tests using an isolated database. Never uses your production URL. |

## Repository guide

```text
app/                    Next.js layout, page shell and API route
components/             Functional React screens and shared UI
lib/api.ts              API routing and authorization
lib/auth.ts             Session lifecycle, origin checks and rate limits
lib/db.ts               PostgreSQL pool and local PGlite adapter
lib/validation.ts       Input schemas and visit policy
lib/types.ts            Shared domain types and constants
db/schema.ts            Canonical database migration
db/schema.sql          Equivalent SQL for a provider SQL console
db/seed.ts              Fictional demonstration property catalog
public/images/          Bundled property photos
public/fonts/           Bundled fonts; no external font request needed
scripts/                Setup, database CLI and integration test
tests/                  Validation and security unit tests
docs/                   Deployment, architecture, API and validation notes
```

## Troubleshooting

- **`node` / `npm` not recognized:** install Node.js 22 or 24 LTS; reopen your terminal.
- **PowerShell blocks `npm.ps1`:** use the included `.bat` launchers, Command Prompt, or `npm.cmd`. You do not need to weaken execution policy.
- **`next` not recognized:** run `npm ci` in the folder containing `package.json`.
- **Port 3000 in use:** run `npm run dev -- --port 3001`.
- **Vercel shows setup required:** add `DATABASE_URL` and `SESSION_SECRET`, initialize the remote schema, and redeploy. See `docs/VERCEL.md`.
- **No remote listings:** production starts with an empty catalog. Create landlord listings and approve them as admin, or run `npm run db:seed` against the remote DB for clearly marked sample homes.
- **Local DB lock:** stop the other server/process using the same `.data` directory. Do not run `db:*` commands while the local server is open.
- **Reset email does not arrive:** verify the sender domain, configure the Resend variables, and check Vercel logs. In development, enable `DEV_EMAIL_PREVIEW=true` to use the explicitly labeled local preview link.
- **New listing not visible:** it remains pending until administrator publication. Editing sends it back to review.
- **Network error during install:** retry `npm ci` with a working package-registry connection. Do not copy another machine’s `node_modules` into this project.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md), [docs/TESTING.md](docs/TESTING.md) and [docs/ASSETS.md](docs/ASSETS.md) for more details.
