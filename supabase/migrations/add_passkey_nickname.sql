-- Add nickname column to passkey_credentials
-- Run this in Supabase SQL Editor for existing databases.
ALTER TABLE passkey_credentials
  ADD COLUMN IF NOT EXISTS nickname text;

-- RLS policy for UPDATE (required for nickname rename)
CREATE POLICY IF NOT EXISTS "passkeys: user can update own"
  ON passkey_credentials FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
