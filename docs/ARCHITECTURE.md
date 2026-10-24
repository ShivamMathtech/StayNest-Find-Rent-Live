# Architecture and operating notes

## One application, one origin

Next.js serves the React App Router shell and the `/api/[...route]` Node.js route. The route delegates to `lib/api.ts`, which validates request bodies, checks the user’s database session and authorizes every resource mutation. UI controls are not the permission boundary.

Client screens are in `components/`. `useData` loads server state and handles pending/error states. Requests use relative `/api` URLs. Favorites, bookings, conversations and notifications are always persisted server-side.

## Data access

`lib/db.ts` supplies a small parameterized-query and transaction interface:

- When `DATABASE_URL` or `POSTGRES_URL` is present, a `pg.Pool` talks to PostgreSQL. Each warm function instance uses a pool capped at four connections. Use a provider’s pooled endpoint; the cap is per instance, not a global application limit.
- Local-only development uses PGlite persisted under `.data/staynest`.
- When `VERCEL` is set, missing PostgreSQL configuration is a hard error. There is no memory or temporary-file production fallback.
- The database is initialized explicitly in production. `db/schema.ts` is the canonical v1 migration; `db/schema.sql` is the identical SQL for a provider console. Apply later schema changes through explicit new versioned migrations.

## Main records

| Table | Relationship / behavior |
| --- | --- |
| `users` | Tenant, landlord or admin; unique normalized email; password hash. |
| `sessions` | Hashed random bearer token, user and expiry. |
| `password_resets` | Hashed single-use token, user and 30-minute expiry. |
| `rate_limits` | Durable per-user/email/IP attempt counters, 15-minute windows. |
| `properties` | Belongs to one landlord; JSON image/amenity arrays; pending/published/archived. |
| `favorites` | Unique user/property pair. |
| `visits` | Tenant/property appointment with a constrained state and reserved time slot. |
| `conversations` | Unique tenant/property pair with the property’s landlord. |
| `messages` | Belongs to a conversation and author; read timestamp. |
| `notifications` | User-specific updates and read timestamp. |
| `reviews` | Unique user/property review; completed viewing required by API. |
| `support_tickets` | Owned by a user, resolved by an administrator. |

## Viewing state machine

| Current state | Actor | Allowed next state |
| --- | --- | --- |
| Pending | Property’s landlord | Confirmed or declined |
| Pending / confirmed | Visitor or property’s landlord | Cancelled |
| Confirmed, appointment time in the past | Property’s landlord | Completed |
| Completed / declined / cancelled | Anyone | No further transitions |

Appointments use `Africa/Nairobi` / UTC+3 throughout the interface and validation. Available times are defined in `lib/types.ts`. Visits must be in the future and within 90 days. The API rejects impossible dates, nonstandard slots and owner self-bookings.

A partial unique index reserves `(property_id, visit_date, visit_time)` while status is pending, confirmed or completed. Property locks, transactions and this index prevent conflicting reservations. Cancellation or decline frees the slot. Archiving a listing cancels active viewings and creates notifications atomically.

A host editing a listing sends it back to review. Existing viewings remain accessible to their participants. An administrator archiving or unpublishing it cancels active visits.

## Authentication and authorization

- Bcrypt password hashes, cost 12; passwords bounded to 72 UTF-8 bytes.
- Cryptographically random 256-bit session tokens; only HMAC digests stored in the DB.
- HttpOnly, SameSite=Lax cookie; Secure on HTTPS/Vercel; seven-day expiry.
- Request-scoped session context via Node AsyncLocalStorage, with cookies returned on the actual HTTP response.
- Server-side session revocation on logout; password reset invalidates all existing sessions. Password change issues a fresh session and revokes others.
- All mutation routes check the request Origin and reject cross-site browser requests.
- Zod validation, strict role/privilege fields and parameterized SQL.
- Query-level owner/participant checks for property edits, appointments, messages, notifications and support requests.
- Public registration cannot create admins or verify a landlord. An operator-only CLI creates the first admin.
- Login, registration, reset, listings, viewing requests, messages and support have database-backed rate limits.
- Error responses never expose SQL, database URLs, password hashes or stack traces.

`SESSION_SECRET` must remain stable and private. Production code does not require or expose a public secret. `.env.local` and `.data` are intentionally absent from the release archive.

## Serverless-compatible messaging

Messages are ordinary short HTTP requests persisted in PostgreSQL. The active page polls every five seconds and pauses polling while hidden; notifications poll every 30 seconds. No long-running socket, background worker or sticky server is required.

For higher traffic, replace polling with a managed realtime provider and add message pagination/retention. Current per-thread response is capped at the latest 200 messages. Admin lists are bounded to 500 properties/users and 200 tickets; user visit history to 300 entries. Large deployments should add cursor pagination, background retention cleanup and detailed audit logging before exceeding these bounds.

## External dependencies

- Managed PostgreSQL for Vercel persistence.
- Optional Resend for password reset emails.
- OpenStreetMap raster tiles through Leaflet; no WebGL requirement. Keep the visible attribution and comply with the tile provider’s usage policy. For significant public traffic, configure a production tile provider in `components/PropertyMap.tsx`.
- Google Maps opens externally for user-requested directions.
- Custom photo URLs are loaded by the visitor’s browser. Bundle/host your own photos before real usage. The server does not fetch arbitrary submitted URLs.

## Before a real public launch

Replace demonstration homes/photos, configure your actual support operation and privacy terms, create a unique administrator, configure backups and monitor database/function errors. Email verification, payment processing, formal ownership verification, legal lease workflows, object-storage uploads and voice calling are not implemented in this release.

The project is a functional application foundation, not a claim of audited enterprise readiness or a housing/financial transaction service. Back up production data and separate Preview databases from production.
