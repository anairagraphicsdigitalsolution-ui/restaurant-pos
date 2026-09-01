import { NextResponse } from "next/server"
import { requireApiUser } from "@/lib/serverAuth"
import { supabaseCloudAdmin } from "@/lib/supabaseCloudServer"
import { resolveRestaurantForUser } from "@/lib/restaurantResolver"
export const runtime="nodejs"
const ELEVEN="https://api.elevenlabs.io/v1"
async function ctx(req, requestedId){
  const user=await requireApiUser(req)
  const {data:profile}=await supabaseCloudAdmin.from("profiles").select("id,role,restaurant_id").eq("id",user.id).maybeSingle()
  if(!profile) throw new Error("Profile not found")
  let rid=String(requestedId||"").trim()
  if(profile.role==="super_admin"){if(!rid) throw new Error("restaurant_id is required")}
  else {const resolved=await resolveRestaurantForUser(user);rid=resolved.restaurantId||profile.restaurant_id||"";if(!rid) throw new Error("Restaurant not found");if(requestedId&&String(requestedId)!==String(rid)) throw new Error("Not authorized")}
  const {data:settings}=await supabaseCloudAdmin.from("plugin_settings").select("config").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
  const {data:plugin}=await supabaseCloudAdmin.from("restaurant_plugins").select("enabled").eq("restaurant_id",rid).eq("plugin_code","calling-device").maybeSingle()
  if(plugin?.enabled!==true) throw new Error("Calling Device plugin is not enabled")
  return {rid,config:settings?.config||{}}
}
async function eleven(path, key, options={}){const res=await fetch(`${ELEVEN}${path}`,{...options,headers:{...(options.headers||{}),"xi-api-key":key}});return res}
export async function POST(req){
  try{
    const body=await req.json(); const action=String(body?.action||""); const {rid,config}=await ctx(req,body?.restaurant_id)
    const key=String(config.elevenlabs_api_key||"").trim(); if(!key) throw new Error("ElevenLabs API key is not configured")
    if(action==="speak"){
      const voiceId=String(body.voice_id||config.elevenlabs_voice_id||"").trim(); if(!voiceId) throw new Error("ElevenLabs voice is not configured")
      const res=await eleven(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,key,{method:"POST",headers:{"Content-Type":"application/json","Accept":"audio/mpeg"},body:JSON.stringify({text:String(body.text||"").slice(0,2000),model_id:String(body.model_id||config.elevenlabs_model_id||"eleven_multilingual_v2"),language_code:String(body.language||config.language||"").split("-")[0]||undefined,voice_settings:{stability:Number(body.stability??config.stability??.45),similarity_boost:Number(body.similarity_boost??config.similarity_boost??.8),style:Number(body.style??config.style??.2),use_speaker_boost:true}})})
      const buf=await res.arrayBuffer(); if(!res.ok){const text=new TextDecoder().decode(buf);throw new Error(`ElevenLabs ${res.status}: ${text.slice(0,500)}`)}
      return new NextResponse(buf,{status:200,headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store"}})
    }
    if(action==="clone"){
      const form=await req.formData(); const file=form.get("file"); const name=String(form.get("name")||"Anaira Calling Voice"); if(!file||typeof file.arrayBuffer!=="function") throw new Error("Voice audio file is required")
      const fd=new FormData(); fd.append("files[]",new Blob([await file.arrayBuffer()],{type:file.type||"audio/mpeg"}),file.name||"voice.mp3"); fd.append("name",name); fd.append("description","Anaira Calling Device voice"); fd.append("remove_background_noise","true")
      const res=await eleven("/voices/add",key,{method:"POST",body:fd}); const out=await res.json().catch(()=>({})); if(!res.ok) throw new Error(`ElevenLabs ${res.status}: ${JSON.stringify(out).slice(0,600)}`)
      const merged={...config,provider:"elevenlabs",elevenlabs_voice_id:out.voice_id,elevenlabs_model_id:config.elevenlabs_model_id||"eleven_multilingual_v2"}
      await supabaseCloudAdmin.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:"calling-device",config:merged,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,plugin_code"})
      return NextResponse.json({success:true,voice_id:out.voice_id,requires_verification:out.requires_verification===true})
    }
    if(action==="design"){
      const description=String(body.description||"").trim(); const text=String(body.text||"").trim()
      if(description.length<20||description.length>1000) throw new Error("Voice description must be 20-1000 characters")
      if(text.length<100||text.length>1000) throw new Error("Preview text must be 100-1000 characters")
      const res=await eleven("/text-to-voice/design",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model_id:"eleven_multilingual_ttv_v2",voice_description:description,text})})
      const out=await res.json().catch(()=>({})); if(!res.ok) throw new Error(`ElevenLabs ${res.status}: ${JSON.stringify(out).slice(0,600)}`)
      return NextResponse.json({success:true,previews:(out.previews||[]).map(x=>({generated_voice_id:x.generated_voice_id,audio_base_64:x.audio_base_64})),description,text})
    }
    if(action==="saveDesign"){
      const generatedVoiceId=String(body.generated_voice_id||"").trim(); const voiceName=String(body.voice_name||"Anaira AI Voice"); const description=String(body.description||"")
      if(!generatedVoiceId) throw new Error("generated_voice_id is required")
      const res=await eleven("/text-to-voice",key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({voice_name:voiceName,voice_description:description,generated_voice_id:generatedVoiceId})})
      const out=await res.json().catch(()=>({})); if(!res.ok) throw new Error(`ElevenLabs ${res.status}: ${JSON.stringify(out).slice(0,600)}`)
      const merged={...config,provider:"elevenlabs",elevenlabs_voice_id:out.voice_id,elevenlabs_model_id:"eleven_multilingual_v2"}
      await supabaseCloudAdmin.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:"calling-device",config:merged,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,plugin_code"})
      return NextResponse.json({success:true,voice_id:out.voice_id,name:out.name||voiceName})
    }
    if(action==="saveVoice"){
      const voiceId=String(body.voice_id||"").trim(); if(!voiceId) throw new Error("voice_id is required")
      const merged={...config,provider:"elevenlabs",elevenlabs_voice_id:voiceId,elevenlabs_model_id:String(body.model_id||config.elevenlabs_model_id||"eleven_multilingual_v2")}
      await supabaseCloudAdmin.from("plugin_settings").upsert({restaurant_id:rid,plugin_code:"calling-device",config:merged,updated_at:new Date().toISOString()},{onConflict:"restaurant_id,plugin_code"})
      return NextResponse.json({success:true,voice_id:voiceId})
    }
    throw new Error("Unsupported action")
  }catch(e){const msg=e?.message||"Calling voice error";return NextResponse.json({success:false,error:msg},{status:/authorized|authentication|profile/i.test(msg)?403:400})}
}
