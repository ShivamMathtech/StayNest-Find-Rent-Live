# Validation report

Validated on 23 October 2026 with Node.js 24.19.0. The archive supports Node.js 22/24; a real Windows machine was not available for execution testing.

## Completed checks

- Production Next.js build: passed, including TypeScript and route generation.
- Standalone TypeScript check: passed.
- Eight automated validation/security unit tests: passed.
- Fifty API integration checks against a real isolated PGlite PostgreSQL database: passed.
- Production dependency audit: no vulnerabilities reported at the time of the check.
- Compiled app browser checks: catalog loading, type filter, maximum-price filter, property navigation, photo-gallery controls, date/slot controls and guest views.
- Database persistence: records survived database close/reopen in the integration suite.

The integration runner calls the exact Request/Response API handler used by the Next.js route. It uses actual SQL, transactions, password hashing, cookies and authorization logic. It does not call an external Vercel deployment or a provisioned Neon account.

Coverage includes registration, normalized email uniqueness, administrator escalation rejection, secure cookie flags, origin checks, role/ownership enforcement, private data visibility, publication, search and price/amenity filters, idempotent favorites, date validation, booking conflicts, host/tenant state transitions, private two-way messages, read receipts, notifications, completed-visit review eligibility/upsert, support resolution, profile edits, password reset/replay rejection, password change, logout token revocation, archive cancellation and durable login rate limits.

## Re-run

```bash
npm ci
npm run typecheck
npm test
npm run test:api
npm run build
```

`test:api` creates a unique temporary database, removes inherited database connection variables and cleans up after itself. It cannot mutate your configured production database. No real email is sent: the optional reset flow uses its explicitly local preview mode.

## Limits of this verification

- No Vercel account deployment, managed PostgreSQL connection, real email delivery or production load test was performed.
- Automated UI sign-in was not needed for API coverage; authenticated workflows were exercised through the handler integration suite.
- Mobile media queries and navigation are included. Physical-device testing and full mobile browser automation were not performed.
- The managed development-preview container could not run the Next.js development diagnostics; the compiled production server was used successfully for public browser checks.
- External map availability depends on the tile provider and internet access. Leaflet uses raster tiles and avoids the WebGL dependency found in the initial iframe approach.

Before a public launch, follow the real-account checklist in `VERCEL.md`, test the final URL on your phone, and verify the production database and optional mail service with your own provider settings.
