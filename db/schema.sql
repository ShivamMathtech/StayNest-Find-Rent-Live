-- StayNest schema v1. Safe to run again; does not drop user data.
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id text PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('tenant','landlord','admin')), phone text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '',
 verified boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS password_resets (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS properties (
 id text PRIMARY KEY, owner_id text NOT NULL REFERENCES users(id), title text NOT NULL,
 location text NOT NULL, address text NOT NULL, type text NOT NULL CHECK(type IN ('Apartment','Studio','House','Villa')),
 price integer NOT NULL CHECK(price > 0), beds integer NOT NULL CHECK(beds >= 0), baths integer NOT NULL CHECK(baths > 0), area integer NOT NULL CHECK(area > 0),
 description text NOT NULL, images jsonb NOT NULL, amenities jsonb NOT NULL,
 lat double precision NOT NULL, lng double precision NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','archived')),
 featured boolean NOT NULL DEFAULT false, demo boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS properties_status_idx ON properties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties(owner_id);
CREATE TABLE IF NOT EXISTS favorites (user_id text REFERENCES users(id) ON DELETE CASCADE, property_id text REFERENCES properties(id) ON DELETE CASCADE, PRIMARY KEY(user_id,property_id));
CREATE TABLE IF NOT EXISTS visits (
 id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id), tenant_id text NOT NULL REFERENCES users(id),
 visit_date text NOT NULL, visit_time text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','declined','completed')),
 note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_visit_slot ON visits(property_id,visit_date,visit_time) WHERE status IN ('pending','confirmed','completed');
CREATE INDEX IF NOT EXISTS visits_tenant_idx ON visits(tenant_id);
CREATE TABLE IF NOT EXISTS conversations (
 id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id), tenant_id text NOT NULL REFERENCES users(id), owner_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(property_id,tenant_id)
);
CREATE TABLE IF NOT EXISTS messages (id text PRIMARY KEY, conversation_id text NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id text NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id,created_at);
CREATE TABLE IF NOT EXISTS notifications (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, title text NOT NULL, body text NOT NULL, href text NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS reviews (id text PRIMARY KEY, property_id text NOT NULL REFERENCES properties(id), user_id text NOT NULL REFERENCES users(id), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(property_id,user_id));
CREATE TABLE IF NOT EXISTS support_tickets (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), subject text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;

COMMIT;
