import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const slug = String(body?.slug || "").trim()
    const type = String(body?.type || "").trim().toLowerCase()
    const id = String(body?.id || "").trim()
    const rating = Number(body?.rating)
    const feedback = String(body?.feedback || "").trim().slice(0, 1000)

    if (!slug || !id || !["table", "room"].includes(type)) {
      return Response.json({ success:false, error:"Invalid QR link" }, { status:400 })
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return Response.json({ success:false, error:"Please select a rating from 1 to 5" }, { status:400 })
    }

    const { data: restaurant, error: restaurantError } = await supabaseAdmin
      .from("restaurants")
      .select("id,name,slug")
      .eq("slug", slug)
      .maybeSingle()

    if (restaurantError || !restaurant) {
      return Response.json({ success:false, error:"Restaurant not found" }, { status:404 })
    }

    const sourceTable = type === "table" ? "tables" : "rooms"
    const sourceColumn = type === "table" ? "table_number" : "room_number"

    let source = null
    const { data: sourceById } = await supabaseAdmin
      .from(sourceTable)
      .select("id")
      .eq("restaurant_id", restaurant.id)
      .eq("id", id)
      .maybeSingle()

    source = sourceById

    if (!source) {
      const numericId = Number(id)
      if (Number.isInteger(numericId) && numericId >= 0) {
        const { data: sourceByNumber } = await supabaseAdmin
          .from(sourceTable)
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq(sourceColumn, numericId)
          .maybeSingle()
        source = sourceByNumber
      }
    }

    if (!source) {
      return Response.json({ success:false, error:"QR source not found" }, { status:404 })
    }

    const { error: insertError } = await supabaseAdmin
      .from("customer_feedback")
      .insert({
        restaurant_id: restaurant.id,
        rating,
        feedback: feedback || null
      })

    if (insertError) {
      console.error("QR FEEDBACK INSERT ERROR:", insertError)
      return Response.json({ success:false, error:"Unable to save your rating" }, { status:500 })
    }

    return Response.json({ success:true, message:"Thank you for rating us!" }, { status:201 })
  } catch (error) {
    console.error("QR FEEDBACK ERROR:", error)
    return Response.json({ success:false, error:"Unable to save your rating" }, { status:500 })
  }
}
