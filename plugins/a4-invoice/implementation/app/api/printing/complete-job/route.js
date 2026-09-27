import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const { restaurantId } = await resolveRestaurantForUser(user)
    if (!restaurantId) throw new Error("Restaurant not found")
    const body = await req.json()
    const jobId = String(body?.job_id || "").trim()
    if (!jobId) throw new Error("Print job is required")
    const success = body?.success === true
    const patch = success
      ? { status: "printed", claimed_at: null, claimed_by: null }
      : { status: "queued", claimed_at: null, claimed_by: null }
    const { data, error } = await supabaseCloudAdmin
      .from("print_jobs")
      .update(patch)
      .eq("id", jobId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "printing")
      .select("id,status,created_at")
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error("Print job is no longer owned by this printer session")
    return NextResponse.json({ success: true, job: data })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Unable to update print job" }, { status: 400 })
  }
}
