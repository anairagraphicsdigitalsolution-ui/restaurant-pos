// Canonical Cloud browser client.
// Keep one Supabase Auth client across the application so AuthProvider,
// dashboard pages and API-token bootstrap share the same persisted session
// and navigator lock.
export { supabaseCloud } from "@/lib/supabase"
