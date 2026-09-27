import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"

export const runtime = "nodejs"

export async function POST(req) {
  try {
    const body = await req.json()
    const identifier = String(body?.identifier || "").trim().toLowerCase()
    const password = String(body?.password || "")
    if (!identifier || !password) return NextResponse.json({ success:false, error:"Username/email and password are required" }, {status:400})

    let email = identifier
    if (!identifier.includes("@")) {
      const { data, error } = await supabaseCloudAdmin.from("profiles").select("email").ilike("username", identifier).maybeSingle()
      if (error) throw error
      if (!data?.email) return NextResponse.json({success:false,error:"Username not found"},{status:401})
      email = data.email
    }

    // The browser completes the actual Supabase Auth sign-in. This endpoint only
    // resolves the login alias to the unique Auth email; no password is stored.
    return NextResponse.json({success:true,email})
  } catch (e) {
    return NextResponse.json({success:false,error:e?.message||"Unable to resolve login"},{status:400})
  }
}
