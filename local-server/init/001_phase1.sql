CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS local_server_info (
  id boolean PRIMARY KEY DEFAULT true,
  server_id uuid NOT NULL DEFAULT gen_random_uuid(),
  server_name text NOT NULL DEFAULT 'Anaira POS Local Server',
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_server_info_singleton CHECK (id)
);

INSERT INTO local_server_info (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS local_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_code text NOT NULL UNIQUE,
  terminal_name text NOT NULL,
  device_type text NOT NULL DEFAULT 'pos',
  active boolean NOT NULL DEFAULT true,
  offline_enabled boolean NOT NULL DEFAULT true,
  printer_enabled boolean NOT NULL DEFAULT false,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS local_sync_state (
  id boolean PRIMARY KEY DEFAULT true,
  mode text NOT NULL DEFAULT 'local' CHECK (mode IN ('local','online','syncing','error')),
  last_online_at timestamptz,
  last_sync_at timestamptz,
  pending_count integer NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_sync_state_singleton CHECK (id)
);

INSERT INTO local_sync_state (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;
