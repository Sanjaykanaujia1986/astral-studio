-- Astro — Neon schema.
--
-- The calculation engine still runs in the browser and works offline. The
-- database adds three things the device cannot hold on its own:
--
--   charts           charts a visitor chooses to save, so they survive a
--                    cleared browser and can be reopened on another device
--   cities           the GeoNames cities5000 set (CC BY 4.0), queryable by the
--                    API for clients that do not want the 3 MB bundle
--   ephemeris_daily  one row per day, 1900-2100, of positions computed by the
--                    SAME engine the app uses — reference data for research
--
-- Every statement is idempotent so the migration can be re-run safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     integer PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Saved charts
--
-- There are no user accounts (excluded by the brief). Charts are scoped to an
-- "owner key": a random 256-bit value generated on the device and never shown.
-- The server stores only its SHA-256, so the database never holds the key, and
-- a visitor can list only charts saved with their own key.
--
-- This is NOT authentication. Anyone holding the key can read those charts,
-- and losing it (clearing browser storage) loses access. It is the honest
-- ceiling of privacy without accounts, and the UI says so.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_hash  char(64)    NOT NULL,
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Chart INPUTS, never results. Results are recomputed on load, so an engine
  -- fix corrects every saved chart instead of leaving stale numbers stored.
  birth       jsonb       NOT NULL,
  settings    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- Denormalised summary for the list view only; not a source of truth.
  summary     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  engine_fingerprint char(8),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS charts_owner_created_idx ON charts (owner_hash, created_at DESC);

-- ---------------------------------------------------------------------------
-- Cities (GeoNames cities5000, CC BY 4.0)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cities (
  id            integer PRIMARY KEY,
  name          text             NOT NULL,
  name_folded   text             NOT NULL,
  admin1        text,
  country_code  char(2)          NOT NULL,
  country_name  text             NOT NULL,
  latitude      double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude     double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  timezone      text             NOT NULL,
  population    integer          NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cities_name_folded_idx ON cities (name_folded text_pattern_ops);
CREATE INDEX IF NOT EXISTS cities_population_idx  ON cities (population DESC);

-- ---------------------------------------------------------------------------
-- Daily ephemeris, 00:00 UT, tropical, geocentric
--
-- positions: { "sun": { "lon": 294.1234567, "lat": 0.0001, "speed": 1.0192,
--                        "dec": -21.23, "retro": false }, ... }
-- Values are rounded to 1e-7 degree (0.36 milliarcsecond).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ephemeris_daily (
  day        date             PRIMARY KEY,
  jd_ut      double precision NOT NULL,
  source     text             NOT NULL,
  positions  jsonb            NOT NULL
);

CREATE TABLE IF NOT EXISTS dataset_meta (
  name        text PRIMARY KEY,
  rows        integer     NOT NULL,
  source      text        NOT NULL,
  license     text,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  loaded_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
