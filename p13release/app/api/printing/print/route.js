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
    const jobType = String(body?.type || "receipt").slice(0, 40)
    const payload = {
      ...(body?.data && typeof body.data === "object" ? body.data : {}),
      content: String(body?.content || "").slice(0, 12000),
      queued_from: "api-print",
      printer: body?.printer || null,
    }
    const { data, error } = await supabaseCloudAdmin.from("print_jobs").insert({
      restaurant_id: restaurantId,
      job_type: jobType,
      reference_id: body?.data?.order_id || null,
      payload,
      status: "queued",
    }).select("id,status,created_at").single()
    if (error) throw error
    return NextResponse.json({ success: true, queued: true, cloud: true, data, message: "Print job queued in Supabase for the connected Anaira printer agent." })
  } catch (e) {
    return NextResponse.json({ success: false, error: e?.message || "Cloud print queue failed" }, { status: 400 })
  }
}
