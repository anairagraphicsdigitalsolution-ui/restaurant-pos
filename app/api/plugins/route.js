import { installPlugin } from "@/lib/pluginManager"

export async function POST(req) {
  try {
    const { restaurant_id, plugin_slug, config } = await req.json()

    const result = await installPlugin(
      restaurant_id,
      plugin_slug,
      config || {}
    )

    return Response.json({
      success: true,
      message: "Plugin installed",
      result
    })

  } catch (err) {
    return Response.json({
      error: err.message
    }, { status: 500 })
  }
}