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

    const { data: job, error: readError } = await supabaseCloudAdmin
      .from("print_jobs")
      .select("id,restaurant_id,job_type,reference_id,status,payload,created_at,claimed_at,claimed_by")
      .eq("id", jobId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle()
    if (readError) throw readError
    if (!job) throw new Error("Print job not found")
    if (job.status !== "queued") throw new Error(`Print job is already ${job.status}`)

    const { data: claimed, error } = await supabaseCloudAdmin
      .from("print_jobs")
      .update({ status: "printing", claimed_at: new Date().toISOString(), claimed_by: `browser:${user.id}` })
      .eq("id", jobId)
      .eq("restaurant_id", restaurantId)
      .eq("status", "queued")
      .select("id,restaurant_id,job_type,reference_id,status,payload,created_at,claimed_at,claimed_by")
      .maybeSingle()
    if (error) throw error
    if (!claimed) throw new Error("Print job was claimed by another printer agent")
    return NextResponse.json({ success: true, job: claimed })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Unable to claim print job" }, { status: 400 })
  }
}
