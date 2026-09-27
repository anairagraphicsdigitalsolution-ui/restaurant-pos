import { localDbEnabled, localJson, localSql, sqlText, sqlJson } from "@/lib/localDb"
import { requireApiUser } from "@/lib/serverAuth"
import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

async function getRestaurantId(user) {
  const profile = await supabaseAdmin
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle()

  return (
    user.user_metadata?.restaurant_id ||
    profile.data?.restaurant_id ||
    null
  )
}

export async function GET(req) {
  try {
    if (!localDbEnabled()) {
      return Response.json(
        { success: false, error: "Local database is disabled" },
        { status: 503 }
      )
    }

    const user = await requireApiUser(req)
    const restaurantId = await getRestaurantId(user)

    if (!restaurantId) {
      return Response.json(
        { success: false, error: "Restaurant not found" },
        { status: 403 }
      )
    }

    const rows = await localJson(`
      SELECT *
      FROM public.restaurant_banners
      WHERE restaurant_id = ${sqlText(restaurantId)}
      ORDER BY sort_order ASC, created_at ASC
    `)

    return Response.json({
      success: true,
      data: rows,
    })
  } catch (e) {
    return Response.json(
      {
        success: false,
        error: e.message || "Local banners fetch failed",
      },
      { status: 400 }
    )
  }
}

export async function POST(req) {
  try {
    if (!localDbEnabled()) {
      return Response.json(
        { success: false, error: "Local database is disabled" },
        { status: 503 }
      )
    }

    const user = await requireApiUser(req)
    const restaurantId = await getRestaurantId(user)

    if (!restaurantId) {
      return Response.json(
        { success: false, error: "Restaurant not found" },
        { status: 403 }
      )
    }

    const body = await req.json()

    const id = body.id || crypto.randomUUID()
    const imageUrl = String(body.image_url || "").trim()
    const sortOrder = Number(body.sort_order || 4)

    if (!imageUrl) {
      return Response.json(
        { success: false, error: "image_url is required" },
        { status: 400 }
      )
    }

    await localSql(`
      INSERT INTO public.restaurant_banners
      (
        id,
        restaurant_id,
        image_url,
        sort_order
      )
      VALUES
      (
        ${sqlText(id)},
        ${sqlText(restaurantId)},
        ${sqlText(imageUrl)},
        ${Number.isFinite(sortOrder) ? sortOrder : 4}
      )
      ON CONFLICT (id)
      DO UPDATE SET
        restaurant_id = EXCLUDED.restaurant_id,
        image_url = EXCLUDED.image_url,
        sort_order = EXCLUDED.sort_order
    `)

    const row = await localJson(`
      SELECT *
      FROM public.restaurant_banners
      WHERE id = ${sqlText(id)}
      LIMIT 1
    `)

    return Response.json({
      success: true,
      data: row[0] || null,
    })
  } catch (e) {
    return Response.json(
      {
        success: false,
        error: e.message || "Local banner save failed",
      },
      { status: 400 }
    )
  }
}
