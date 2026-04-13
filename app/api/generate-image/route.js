import OpenAI from "openai"

export const runtime = "nodejs"

// ✅ INIT CLIENT
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req) {
  try {
    const body = await req.json()

    const prompt = body?.prompt
    const size = body?.size || "1024x1024"
    let quality = body?.quality || "medium"

    // ✅ VALIDATION
    if (!prompt) {
      return Response.json(
        { error: "Prompt required" },
        { status: 400 }
      )
    }

    // ✅ FIX QUALITY (IMPORTANT)
    const validQualities = ["low", "medium", "high", "auto"]
    if (!validQualities.includes(quality)) {
      quality = "medium"
    }

    // ✅ FIX SIZE (SAFE)
    const validSizes = ["512x512", "1024x1024", "1792x1024"]
    const finalSize = validSizes.includes(size) ? size : "1024x1024"

    // ✅ GENERATE IMAGE
    const result = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: finalSize,
      quality
    })

    const image = result?.data?.[0]?.url

    if (!image) {
      return Response.json(
        { error: "No image generated" },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      image
    })

  } catch (err) {
    console.error("🔥 REAL ERROR:", err)

    return Response.json(
      {
        success: false,
        error: err.message || "Image generation failed"
      },
      { status: 500 }
    )
  }
}