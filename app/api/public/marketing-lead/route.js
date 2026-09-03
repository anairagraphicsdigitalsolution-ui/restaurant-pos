import { NextResponse } from "next/server"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import nodemailer from "nodemailer"

export const runtime = "nodejs"

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 5
const hits = globalThis.__anairaPublicMarketingLeadHits || new Map()
globalThis.__anairaPublicMarketingLeadHits = hits

function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max) }
function clientIp(req) { return clean(req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown", 100) }

async function sendFounderEmail(lead) {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return { sent: false, configured: false }
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass }
  })
  const recipient = process.env.MARKETING_LEAD_TO || user
  await transporter.sendMail({
    from: `Anaira Website <${user}>`,
    to: recipient,
    replyTo: lead.email || undefined,
    subject: `New Anaira website enquiry — ${lead.restaurantName}`,
    text: [
      `New website enquiry`,
      `Name: ${lead.name}`,
      `Phone: ${lead.phone}`,
      `Email: ${lead.email || "Not provided"}`,
      `Restaurant: ${lead.restaurantName}`,
      `Business type: ${lead.businessType || "Not provided"}`,
      `Plan: ${lead.plan || "Not selected"}`,
      `Preferred contact: ${lead.preferredContact || "Not provided"}`,
      `Message: ${lead.message || "Not provided"}`,
      "",
      "Source: website"
    ].join("\n")
  })
  return { sent: true, configured: true }
}

export async function POST(req) {
  try {
    const ip = clientIp(req)
    const now = Date.now()
    const previous = hits.get(ip) || []
    const recent = previous.filter(t => now - t < WINDOW_MS)
    if (recent.length >= MAX_REQUESTS) return NextResponse.json({ success:false,error:"Too many requests. Please try again later." },{status:429})
    recent.push(now); hits.set(ip,recent)

    const body = await req.json()
    if (clean(body.website,120)) return NextResponse.json({success:true})

    const name=clean(body.name,120), restaurantName=clean(body.restaurant_name || body.restaurant,160)
    const phone=clean(body.phone,40), email=clean(body.email,180).toLowerCase()
    const businessType=clean(body.business_type,80), plan=clean(body.plan,40)
    const preferredContact=clean(body.preferred_contact,60), message=clean(body.message,2000)
    const source=clean(body.source,80)||"website", campaign=clean(body.campaign,160)||null
    const medium=clean(body.medium,80)||null, content=clean(body.content,160)||null
    const clickId=clean(body.click_id,180)||null, sessionId=clean(body.session_id,180)||null
    if(!name||!restaurantName||!phone) throw new Error("Name, restaurant name and phone are required")
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email")

    const since=new Date(now-24*60*60*1000).toISOString()
    const {data:duplicate}=await supabaseCloudAdmin.from("platform_marketing_leads").select("id,name,created_at,status").or(`phone.eq.${phone}${email?`,email.eq.${email}`:""}`).gte("created_at",since).order("created_at",{ascending:false}).limit(1).maybeSingle()
    if(duplicate?.id) return NextResponse.json({success:true,duplicate:true,lead_id:duplicate.id})

    const notes=[restaurantName&&`Restaurant: ${restaurantName}`,businessType&&`Business type: ${businessType}`,plan&&`Plan: ${plan}`,preferredContact&&`Preferred contact: ${preferredContact}`,message&&`Message: ${message}`].filter(Boolean).join("\n")||null
    const {data:lead,error}=await supabaseCloudAdmin.from("platform_marketing_leads").insert({name,phone,email:email||null,source,status:"new",notes}).select("id,name,phone,email,source,status,notes,created_at").single()
    if(error) throw error

    await supabaseCloudAdmin.from("platform_marketing_attribution").insert({lead_id:lead.id,source,medium,content,click_id:clickId,session_id:sessionId,campaign_id:body.campaign_id||null,stage:"lead",revenue:0})
    await supabaseCloudAdmin.from("marketing_audit_logs").insert({scope:"platform",action:"public_marketing_lead_created",entity_type:"lead",entity_id:lead.id,metadata:{source,campaign,medium,content,click_id:!!clickId,session_id:!!sessionId}})

    let emailStatus={sent:false,configured:false}
    try { emailStatus=await sendFounderEmail({name,phone,email,restaurantName,businessType,plan,preferredContact,message}) } catch(e) { console.error("MARKETING LEAD EMAIL ERROR",e) }
    return NextResponse.json({success:true,lead_id:lead.id,email_sent:emailStatus.sent})
  } catch(e) {
    return NextResponse.json({success:false,error:e?.message||"Unable to submit request"},{status:400})
  }
}
