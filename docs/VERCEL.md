# Deploy StayNest frontend + backend in the SAME Vercel project

## The deployment layout

| Component | Where it runs |
| --- | --- |
| React pages, CSS, fonts and images | Your Vercel project |
| Next.js `/api/*` route handlers | Serverless Node.js functions in that same Vercel project |
| Accounts, sessions, properties, messages and viewings | A managed PostgreSQL database linked to the project |

There is one source repository, one Vercel project and one public application domain. The client calls relative `/api/...` routes, so it never needs a separate backend URL. Vercel automatically deploys the route handlers as functions.

Vercel’s application filesystem is not a durable database. Local PGlite is disabled whenever `VERCEL` is present. A missing production database produces a clear setup error, rather than silently losing bookings after a function restart.

## 1. Prepare the source

Install Node.js 22 or 24 LTS and extract the ZIP. In the inner `staynest` directory:

```bash
npm ci
npm run setup
npm run build
```

Create a GitHub/GitLab/Bitbucket repository and upload the contents of this directory, including `package-lock.json`, `vercel.json`, `app`, `lib`, `components`, `db`, `scripts` and `public`.

**Do not upload** `.env.local`, `node_modules`, `.data`, `.next` or any private credentials. The included `.gitignore` excludes these. Do not upload only the ZIP itself to the repository; extract and commit its contents.

## 2. Import into Vercel

Choose **Add New → Project**, then import your repository.

| Setting | Value |
| --- | --- |
| Framework preset | **Next.js** |
| Root directory | The folder containing `package.json`: `./` if you committed this folder’s contents; `staynest` if your repository has an outer wrapper. |
| Node.js version | **22.x** or **24.x** |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | **Leave on the Next.js default**. Do not enter `dist`, `build` or `out`. |
| Start command | No custom start command needed on Vercel. |

The included `vercel.json` specifies Next.js and the install/build commands. Do not add `output: 'export'` to `next.config.ts`; static export would remove the backend behavior.

## 3. Connect a persistent PostgreSQL database

Use **Neon Postgres** from Vercel’s Marketplace/Storage integration, or another compatible managed PostgreSQL service such as Supabase.

1. Create a database and connect it to this Vercel project.
2. Choose a database region near the application’s function region.
3. Use the provider’s **pooled** connection URL for serverless requests. Preserve its TLS parameters. Do not disable certificate checks.
4. In the Vercel project’s environment variables, set the URL as `DATABASE_URL`. If the integration only supplies `POSTGRES_URL`, the app also accepts that name. If it supplies a prefixed variable, copy its value into `DATABASE_URL`.
5. Choose the environments that should use it. Prefer an isolated database/branch for Preview deployments rather than connecting arbitrary development branches to the live database.

Example shape only — replace the whole value with your provider’s exact URL:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@POOLED_HOST/DATABASE?sslmode=require
```

There are no real credentials in the archive. Do not put this value in a `NEXT_PUBLIC_*` variable.

## 4. Add the session secret

Generate a new secret in your terminal:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Add the result to Vercel as `SESSION_SECRET`. Keep it private and consistent across deployments. Changing it invalidates existing sessions and pending password-reset tokens.

Required environment variables:

| Variable | Required? | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes (or `POSTGRES_URL`) | Managed pooled PostgreSQL URL. |
| `SESSION_SECRET` | Yes | At least 32 random characters; use the generated 64-character value. |
| `APP_URL` | For password reset | Your exact deployed HTTPS origin, without a trailing slash. |
| `RESEND_API_KEY` | For password reset | Resend key with send permission. |
| `EMAIL_FROM` | For password reset | Verified sender, e.g. `StayNest <hello@your-domain.example>`. |

`LOCAL_DEMO`, `LOCAL_DATABASE_PATH` and `DEV_EMAIL_PREVIEW` are local settings, not production requirements. Do not deploy the local demonstration database or add `ADMIN_PASSWORD` as a runtime environment variable.

## 5. Initialize the remote schema once

In your local `.env.local`, set `DATABASE_URL` to the same production database URL. Stop your local development server first. Then run:

```bash
npm run db:setup
```

This applies the version-1 schema in a transaction. It is idempotent and does not drop or overwrite existing data. Future versions should add explicit migrations; repeatedly running version 1 is not a substitute for future schema changes.

If you cannot connect from your terminal, paste **`db/schema.sql`** into your provider’s authenticated SQL editor instead. This is the same schema.

The Vercel build deliberately does not migrate or seed databases. It builds without database connectivity and does not mutate the production DB during Preview builds.

## 6. Create your administrator

Set these values in your **local** `.env.local`, along with the remote `DATABASE_URL`:

```dotenv
ADMIN_EMAIL=your-real-admin-email@example.com
ADMIN_PASSWORD=choose-a-unique-strong-password
ADMIN_NAME=StayNest Administrator
```

Use a unique password between 12 and 72 UTF-8 bytes. Run:

```bash
npm run db:admin
```

The command creates the admin or upgrades the account with that exact email and changes its password to the supplied value. Remove `ADMIN_PASSWORD` from the local environment file after successful setup. Admin accounts cannot be created through public signup.

For a product demo only, you can also run:

```bash
npm run db:seed
```

This adds eight **sample** homes and a demonstration landlord whose remote password is randomly generated and unknown. It does **not** create remotely usable tenant/admin demo logins. Sign up real landlord accounts and create your own listings for real operation. For a clean real deployment, skip seeding.

## 7. Deploy and verify

Deploy the Vercel project. Once you have its final domain:

1. Open the homepage and `/api/health`. Health should return `{"data":{"status":"ok","database":"connected","app":"StayNest"}}`.
2. Register a tenant and a landlord account in separate browser sessions.
3. Add a landlord property. Sign in as the admin at `/login`, open `/admin`, and publish it.
4. Find it in search, save it and request a visit as the tenant.
5. Confirm the visit as the landlord. Send a message each way.
6. Refresh or reopen both browsers and verify that the data remains.
7. Add `APP_URL=https://your-actual-domain` for password-reset links. If using Resend, verify its sender domain and add the mail variables. Redeploy after changing environment settings.

If you change the domain later, update `APP_URL`. No frontend API hostname change is needed: `/api` stays on the same origin.

## Common deployment failures

| Symptom | Fix |
| --- | --- |
| Vercel cannot find `package.json` | Set the correct root directory. Do not select `app`, `components` or `public`. |
| Frontend works but APIs are 404 | Select Next.js; remove static-export settings and SPA catch-all rewrites that override `/api`. Use this archive’s `vercel.json`. |
| `DATABASE_NOT_CONFIGURED` / setup banner | Add `DATABASE_URL` or `POSTGRES_URL` to the environment actually being deployed, then redeploy. |
| `Initialize the database` | Run `npm run db:setup` against that remote URL. |
| Session secret setup error | Add `SESSION_SECRET` with at least 32 characters and redeploy. |
| Database connection timeout | Use the provider’s public pooled URL, correct password, TLS parameters and network settings. A local `localhost` URL cannot work in Vercel. |
| Database works locally, empty on Vercel | Your `.data` database is local only. Populate the remote database separately. |
| Login expires after deploying | Ensure the session secret is unchanged and all deployments use the same intended database. |
| `EACCES` / read-only filesystem | Do not enable filesystem storage on Vercel. This app uses PostgreSQL there. |
| Preview overwrites production data | Use separate environment-specific database connections. |
| Images fail | Use reachable HTTPS image URLs; bundled `/images/*.jpg` files work without external image hosting. |
| Reset email says not configured | Add Resend and sender credentials, plus `APP_URL`; ordinary login still works without email. |

## Optional email setup

The backend calls Resend’s `POST https://api.resend.com/emails` endpoint only for a user-requested password reset. Delivery requires a valid account, sending permission and verified sender domain. Email sending is not mocked in production. Signup and viewing notifications are in-app and do not require an email provider.

## Official references checked for this delivery

- Next.js on Vercel: https://vercel.com/docs/frameworks/full-stack/nextjs
- Postgres integrations: https://vercel.com/docs/postgres
- Database marketplace: https://vercel.com/marketplace/category/database
- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Resend send-email API: https://resend.com/docs/api-reference/emails/send-email

Provider UI labels can change. This archive includes no live deployment, paid subscription or provider account.
