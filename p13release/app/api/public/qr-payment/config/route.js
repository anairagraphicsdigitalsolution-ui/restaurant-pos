import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { rateLimit, rateLimitResponse } from "@/lib/publicRateLimit"

export const runtime = "nodejs"

export async function GET(req) {
  const limit = rateLimit(req, "qr-payment-config", 30)
  if (!limit.ok) return rateLimitResponse(limit)
  try {
    const { searchParams } = new URL(req.url)
    const restaurantId = String(searchParams.get("restaurant_id") || "").trim()
    if (!restaurantId) return Response.json({ success:false, error:"Restaurant is required" }, { status:400 })

    const [
      { data: paymentAccount },
      { data: paymentPlugin },
      { data: cashfreePlugin },
      { data: cashfreeSettings },
      { data: restaurant },
    ] = await Promise.all([
      supabaseCloudAdmin.from("restaurant_payment_accounts").select("active,settings").eq("restaurant_id", restaurantId).eq("provider", "payment-accounts").order("updated_at", { ascending:false }).limit(1).maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "payment-accounts").maybeSingle(),
      supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id", restaurantId).eq("plugin_code", "cashfree-payment-gateway").maybeSingle(),
      supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id", restaurantId).eq("plugin_code", "cashfree-payment-gateway").maybeSingle(),
      supabaseCloudAdmin.from("restaurants").select("name").eq("id", restaurantId).maybeSingle(),
    ])

    const settings = paymentAccount?.settings || {}
    const manualEnabled = paymentAccount?.active === true && paymentPlugin?.enabled === true && Boolean(settings.upi_id || settings.manual_qr_image_url)
    const autoEnabled = cashfreePlugin?.enabled === true && cashfreeSettings?.config?.enabled_for_restaurant !== false && paymentAccount?.active === true && settings.auto_payment_detection === true

    return Response.json({
      success:true,
      payment_config:{
        auto_enabled:autoEnabled,
        manual_enabled:manualEnabled,
        merchant_name:String(settings.merchant_name || restaurant?.name || "Restaurant").slice(0,100),
        upi_id:manualEnabled ? String(settings.upi_id || "") : "",
        manual_qr_image_url:manualEnabled ? String(settings.manual_qr_image_url || "") : "",
        auto_provider:autoEnabled ? "cashfree" : null,
      }
    }, { status:200, headers:{"Cache-Control":"private, max-age=30"} })
  } catch (error) {
    console.error("QR PAYMENT CONFIG ERROR:", error)
    return Response.json({ success:false, error:"Unable to load payment options" }, { status:500, headers:{"Cache-Control":"no-store"} })
  }
}
