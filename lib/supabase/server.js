import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
export function createClient() { return supabaseCloudAdmin }
export const supabaseAdmin = supabaseCloudAdmin
