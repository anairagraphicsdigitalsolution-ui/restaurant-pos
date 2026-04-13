import { runPlugin } from "@/lib/pluginManager"

export async function POST(req) {
  try {
    const { restaurant_id, plugin_slug, action, data } = await req.json()

    const result = await runPlugin(
      restaurant_id,
      plugin_slug,
      action,
      data
    )

    return Response.json({
      success: true,
      result
    })

  } catch (err) {
    return Response.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}