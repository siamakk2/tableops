-- Audit log for admin actions that touch client accounts.
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS admin_audit (
  id           bigserial PRIMARY KEY,
  action       text        NOT NULL,
  target_email text        NOT NULL,
  reason       text,
  at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit (target_email);
CREATE INDEX IF NOT EXISTS admin_audit_at_idx     ON admin_audit (at DESC);

-- Service role only: no client-side access.
ALTER TABLE admin_audit ENABLE ROW LEVEL SECURITY;

-- The `subs` table is written by api/signup.js and api/webhook.js but was never
-- in supabase_setup.sql. Defined here so a rebuild does not lose it.
CREATE TABLE IF NOT EXISTS subs (
  email               text PRIMARY KEY,
  status              text NOT NULL DEFAULT 'active',
  stripe_customer     text,
  stripe_subscription text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subs ENABLE ROW LEVEL SECURITY;
