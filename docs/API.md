# StayNest API

Base URL: `/api` on the same domain as the frontend. Successful responses use `{"data": ...}`; errors use `{"error":"message"}`. JSON mutations require `Content-Type: application/json`. The session cookie is HttpOnly; do not store bearer tokens in browser localStorage. All private routes verify authorization server-side.

| Method | Route | Access / purpose |
| --- | --- | --- |
| GET | `/config` | Public UI capabilities, currency and timezone. |
| GET | `/health` | Check that schema and database are reachable. |
| GET | `/auth/me` | Current safe user or null. |
| POST | `/auth/register` | `{name,email,password,role}`; role tenant or landlord. |
| POST | `/auth/login` | `{email,password}`; sets cookie. |
| POST | `/auth/logout` | Revokes session and clears cookie. |
| POST | `/auth/forgot` | `{email}`; optional email integration/local preview. |
| POST | `/auth/reset` | `{token,password}`; one-use reset and session revocation. |
| PATCH | `/profile` | Current user `{name,phone,bio}`. |
| POST | `/profile/password` | `{currentPassword,password}`. |
| GET | `/properties` | Published properties, search/filter/sort/pagination. |
| POST | `/properties` | Landlord/admin creates listing. |
| GET | `/properties/:id` | Public published property, reviews and current-user review eligibility; owner/admin can view unpublished. |
| PATCH | `/properties/:id` | Owner/admin replaces editable listing fields. |
| DELETE | `/properties/:id` | Owner/admin archives; cancels active visits. |
| GET | `/properties/:id/slots?date=YYYY-MM-DD` | Returns reserved time strings only, never visitor identities. |
| POST | `/properties/:id/favorite` | Add current-user favorite, idempotent. |
| DELETE | `/properties/:id/favorite` | Remove current-user favorite. |
| POST | `/properties/:id/reviews` | `{rating,body}`; only completed visitor, upsert one review. |
| GET | `/visits` | Current user’s visits as visitor or host. |
| POST | `/visits` | `{propertyId,date,time,note}`; creates pending visit. |
| PATCH | `/visits/:id` | `{status}` according to actor/state policy. |
| GET | `/conversations` | Only conversations in which the user participates. |
| POST | `/conversations` | `{propertyId}`; idempotent tenant/host conversation. |
| GET | `/conversations/:id/messages` | Participant only; latest 200 messages in chronological order. |
| POST | `/conversations/:id/messages` | Participant only `{body}`. |
| PATCH | `/conversations/:id/messages` | Participant marks incoming messages read. |
| GET | `/notifications` | Current-user notifications. |
| PATCH | `/notifications` | Mark current-user notifications read. |
| GET | `/host` | Landlord/admin’s own properties, including unpublished. |
| GET | `/landlords/:id` | Public host profile and published properties; no private email/phone. |
| GET | `/support` | Current-user tickets. |
| POST | `/support` | `{subject,body}`. |
| GET | `/admin` | Admin-only properties, safe user fields and support tickets. |
| PATCH | `/admin/properties/:id` | Admin-only `{status,featured}`. |
| PATCH | `/admin/users/:id` | Admin-only `{verified}` for a landlord. |
| PATCH | `/admin/tickets/:id` | Admin-only `{status: "open" | "resolved"}`. |

## Property search parameters

`q`, `type`, `min`, `max`, `beds`, `amenities` (comma-separated), `verified=true`, `saved=true`, `sort`, `page`.

Types: `Apartment`, `Studio`, `House`, `Villa`. Sort: `recommended`, `price_asc`, `price_desc`, `newest`. Results are paginated in groups of 24. `saved=true` requires authentication. All prices are KES per month. `beds=2` means at least two bedrooms.

## Listing payload

```json
{
  "title": "Garden Apartment",
  "location": "Kilimani, Nairobi",
  "address": "Example Road, Kilimani, Nairobi",
  "type": "Apartment",
  "price": 65000,
  "beds": 2,
  "baths": 2,
  "area": 115,
  "description": "A spacious, light-filled apartment with a private balcony and comfortable rooms.",
  "images": ["/images/apartment.jpg"],
  "amenities": ["Wi-Fi", "Parking", "Security", "Balcony"],
  "lat": -1.2921,
  "lng": 36.7874
}
```

Only a new listing created directly by an admin is published immediately. Landlord creation/edits always require review. Property image URLs must be HTTPS or a safe bundled `/images/*.jpg|png|webp` path. One to eight images are allowed.

## Status codes

- 400: invalid input or invalid action.
- 401: sign-in required / incorrect login.
- 403: action not permitted / cross-origin mutation.
- 404: resource not found or not visible to this user.
- 409: unique conflict or disallowed visit transition.
- 413 / 415: oversized body / wrong content type.
- 429: rate limit reached.
- 503: database/mail/session setup required.

## Curl example against your own local server

```bash
curl http://localhost:3000/api/health
curl "http://localhost:3000/api/properties?type=Apartment&max=80000"
```

Use the UI for normal authentication and ensure automated clients preserve the server’s cookie. No public database-administration, seed or test endpoint is shipped.
