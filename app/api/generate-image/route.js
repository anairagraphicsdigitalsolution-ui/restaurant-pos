import OpenAI from "openai"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function POST(req) {
  try {
    const user = await requireApiUser(req)

    const body = await req.json()
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""

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

    const image = result?.data?.[0]?.url

    if (!image) {
      return Response.json(
        { success: false, error: "No image generated" },
        { status: 500 }
      )
    }

    return Response.json({
      success: true,
      image
    })
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
