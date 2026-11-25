import "server-only";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

/**
 * SERVER ONLY. Never import this module from a Client Component or expose
 * SUPABASE_SERVICE_ROLE_KEY through a NEXT_PUBLIC_ variable.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isAdminConfigured() {
  return Boolean(url && serviceRoleKey);
}

export function createAdminClient(): SupabaseClient {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "DEMO_ADMIN_NOT_CONFIGURED: set SUPABASE_SERVICE_ROLE_KEY in the server environment to enable demo provisioning."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
