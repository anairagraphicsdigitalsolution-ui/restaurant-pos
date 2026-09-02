import OpenAI from "openai"
import crypto from "node:crypto"
import { requireApiUser } from "@/lib/serverAuth"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req) {
  try {
    const user = await requireApiUser(req)

    const body = await req.json()
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""
    const pluginCode = String(body?.plugin_code || "").trim()
    const allowedPlugins = new Set(["ai-image-studio", "ai-poster-studio", "ai-logo-studio"])
    if (!allowedPlugins.has(pluginCode)) {
      return Response.json({ success:false, error:"AI plugin is required" }, { status:400 })
    }

    const { data: profile, error: profileError } = await supabaseCloudAdmin
      .from("profiles")
      .select("restaurant_id, role")
      .eq("id", user.id)
      .maybeSingle()
    if (profileError || !profile) {
      return Response.json({ success:false, error:"Profile not found" }, { status:403 })
    }
    const isSuperAdmin = profile.role === "super_admin"
    const restaurantId = profile.restaurant_id

    // Super Admin is unrestricted. Restaurant users remain protected by
    // their restaurant plugin row.
    if (!isSuperAdmin) {
      if (!restaurantId) {
        return Response.json({ success:false, error:"Restaurant context required" }, { status:403 })
      }

      const { data: pluginRow, error: pluginError } = await supabaseCloudAdmin
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", pluginCode)
        .maybeSingle()

      if (pluginError) throw pluginError

      if (pluginRow?.enabled !== true) {
        return Response.json(
          { success:false, error:"This AI plugin is not active for this restaurant." },
          { status:403 }
        )
      }
    }

    if (!prompt) {
      return Response.json(
        { success: false, error: "Prompt required" },
        { status: 400 }
      )
    }

    // Prevent accidental/extreme payloads and uncontrolled usage.
    const safePrompt = prompt.slice(0, 4000)
    const size = body?.size || "1024x1024"
    let quality = body?.quality || "medium"

    const validQualities = ["low", "medium", "high", "auto"]
    if (!validQualities.includes(quality)) quality = "medium"

    const validSizes = ["512x512", "1024x1024", "1792x1024"]
    const finalSize = validSizes.includes(size) ? size : "1024x1024"

    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt: safePrompt,
      size: finalSize,
      quality
    })

    const item = result?.data?.[0]
    let bytes = null
    if (item?.b64_json) bytes = Buffer.from(item.b64_json, "base64")
    else if (item?.url) { const ir = await fetch(item.url); if (!ir.ok) throw new Error("Unable to retrieve generated image"); bytes = Buffer.from(await ir.arrayBuffer()) }
    if (!bytes) return Response.json({ success:false, error:"No image generated" }, { status:500 })

    const bucket = isSuperAdmin ? "platform-marketing-media" : "restaurant-marketing-media"
    const path = `${isSuperAdmin ? user.id : restaurantId}/ai-${crypto.randomUUID()}.png`
    const { error: uploadError } = await supabaseCloudAdmin.storage.from(bucket).upload(path, bytes, { contentType:"image/png", upsert:false })
    if (uploadError) throw uploadError
    const { data: signed, error: signedError } = await supabaseCloudAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60)
    if (signedError) throw signedError

    return Response.json({ success:true, image:signed.signedUrl, media_path:path })
  } catch (err) {
    console.error("IMAGE GENERATION ERROR:", err)

    const isAuth =
      /authentication|authorized|login|token|session/i.test(err?.message || "")

    return Response.json(
      {
        success: false,
        error: isAuth ? "Authentication required" : (err?.message || "Image generation failed")
      },
      { status: isAuth ? 401 : 500 }
    )
  }
}
