import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * Supabase Admin client (service role).
 * Never expose this to the browser — server only.
 * Used for privileged operations like generating magic-link tokens
 * after passkey authentication.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
