import { supabase } from "@/lib/supabase"

export async function GET(req) {
  const restaurant_id = "demo123"

  const { data, error } = await supabase
    .from("plugins")
    .select("*")
    .eq("restaurant_id", restaurant_id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ data })
}