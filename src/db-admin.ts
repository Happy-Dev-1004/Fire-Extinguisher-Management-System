import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Service-role client: bypasses RLS, can call auth.admin.* APIs.
// NEVER expose this key to the browser or return it in any response.
// Used exclusively for server-side session verification and admin writes.
const supabaseUrl         = process.env.SUPABASE_URL!;
const supabaseServiceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
  realtime: { transport: ws as any },
});
