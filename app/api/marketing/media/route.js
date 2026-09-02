import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { requireApiUser } from "@/lib/serverAuth"
import { requireStaffPermission } from "@/lib/serverStaffPermissions"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
import crypto from "node:crypto"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const user = await requireApiUser(req)
    const r = await resolveRestaurantForUser(user)
    if (!r.restaurantId) throw new Error("Restaurant not found")
    await requireStaffPermission(user, r.restaurantId, "marketing")
    const form = await req.formData()
    const file = form.get("file")
    if (!file || typeof file.arrayBuffer !== "function") throw new Error("Media file is required")
    const type = String(file.type || "")
    if (!type.startsWith("image/") && !type.startsWith("video/")) throw new Error("Only image/video files are supported")
    if (Number(file.size || 0) > 100 * 1024 * 1024) throw new Error("Media file is too large. Maximum size is 100 MB")
    const ext = (String(file.name || "media").split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin"
    const path = `${r.restaurantId}/${crypto.randomUUID()}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error } = await supabaseCloudAdmin.storage.from("restaurant-marketing-media").upload(path, bytes, { contentType:type, upsert:false })
    if (error) throw error
    const { data, error: signedError } = await supabaseCloudAdmin.storage.from("restaurant-marketing-media").createSignedUrl(path, 60 * 60)
    if (signedError) throw signedError
    return NextResponse.json({ success:true, url:data.signedUrl, path })
  } catch (e) {
    return NextResponse.json({ success:false, error:e.message || "Unable to upload marketing media" }, { status:400 })
  }
}
