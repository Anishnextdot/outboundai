import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "../env";

// Server-only Supabase client using the service-role key. Never import this
// into client components — the key bypasses row-level security.

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!hasSupabase()) {
    // Loud failure — no silent fallback. Persistence is required.
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
        "and apply supabase/migrations/0001_init.sql."
    );
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
