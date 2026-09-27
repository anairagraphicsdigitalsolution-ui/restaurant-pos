import "server-only"
// Backward-compatible server Supabase client.
// Server/admin operations must use the service-role key only.
export { supabaseCloudAdmin as supabaseAdmin, supabaseCloudAuth } from "@/lib/supabaseCloudServer"
export const supabaseServerRuntimeMode = "cloud"
