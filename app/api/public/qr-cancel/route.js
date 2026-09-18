import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const orderId = String(body?.order_id || "").trim()
    const token = String(body?.token || "").trim()
    if (!orderId || !token) return NextResponse.json({ success:false, error:"Invalid cancellation request" }, { status:400 })
    const { data, error } = await supabaseAdmin.rpc("cancel_public_qr_order", {
      p_session_token: token,
      p_order_id: orderId,
      p_reason: "Cancelled by customer"
    })
    if (error) return NextResponse.json({ success:false, error:error.message }, { status:400 })
    return NextResponse.json({ success:true, order:data })
  } catch (e) {
    return NextResponse.json({ success:false, error:"Unable to cancel order" }, { status:500 })
  }
}
