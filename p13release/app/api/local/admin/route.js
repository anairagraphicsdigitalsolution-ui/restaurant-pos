import { localDbEnabled, localJson, localSql, sqlText } from "@/lib/localDb"
import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

async function localReturning(sql) {
  const raw = await localSql(`WITH changed AS (${sql}) SELECT COALESCE(json_agg(changed), '[]'::json) FROM changed;`)
  return raw ? JSON.parse(raw) : []
}
export const runtime = "nodejs"
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const validUuid=v=>UUID_RE.test(String(v||"").trim())
async function resolveRestaurant(user,requestedId){
 const {data:p,error}=await supabaseAdmin.from("profiles").select("id,role,restaurant_id").eq("id",user.id).maybeSingle()
 if(error) throw new Error(error.message)
 if(!p||!["admin","super_admin"].includes(p.role)) throw new Error("Admin access required")
 if(p.role==="admin"){
  const id=p.restaurant_id||user.user_metadata?.restaurant_id||user.app_metadata?.restaurant_id
  if(!id) throw new Error("Restaurant not linked to this account")
  if(requestedId&&requestedId!==id) throw new Error("Restaurant access denied")
  return id
 }
 const id=requestedId||user.user_metadata?.restaurant_id||user.app_metadata?.restaurant_id
 if(!id) throw new Error("Restaurant is required")
 return id
}
async function assertLocalRestaurant(id){
 if(!validUuid(id)) throw new Error("Invalid restaurant id")
 const rows=await localJson(`SELECT id FROM "restaurants" WHERE id=${sqlText(id)} LIMIT 1`)
 if(!rows[0]) throw new Error("Restaurant is not present in local database")
}
async function readLocal(id){
 await assertLocalRestaurant(id)
 const [r,m,b]=await Promise.all([
  localJson(`SELECT * FROM "restaurants" WHERE id=${sqlText(id)} LIMIT 1`),
  localJson(`SELECT * FROM "menu_items" WHERE restaurant_id=${sqlText(id)} ORDER BY category,name`),
  localJson(`SELECT * FROM "restaurant_banners" WHERE restaurant_id=${sqlText(id)} ORDER BY sort_order,created_at`)
 ])
 return {restaurant:r[0]||null,menu:m,banners:b}
}
async function writeLocal(body,id){
 await assertLocalRestaurant(id)
 const op=String(body?.operation||"").trim()
 if(op==="restaurant.update"){
  const fields=[]
  for(const k of ["opening_time","cuisine","description","logo"]){if(Object.prototype.hasOwnProperty.call(body,k)) fields.push(`${k}=${sqlText(body[k]==null?null:String(body[k]))}`)}
  if(!fields.length) throw new Error("No restaurant fields supplied")
  const rows=await localReturning(`UPDATE "restaurants" SET ${fields.join(",")} WHERE id=${sqlText(id)} RETURNING *`)
  if(!rows[0]) throw new Error("Restaurant not found in local database")
  return rows[0]
 }
 if(op==="menu.insert"){
  const name=String(body.name||"").trim(), category=String(body.category||"").trim(), price=Number(body.price)
  if(!name||!category||!Number.isFinite(price)) throw new Error("Invalid menu item")
  return (await localReturning(`INSERT INTO "menu_items" (name,price,category,description,image,restaurant_id) VALUES (${sqlText(name)},${price},${sqlText(category)},${sqlText(body.description==null?null:String(body.description))},${sqlText(body.image==null?null:String(body.image))},${sqlText(id)}) RETURNING *`))[0]
 }
 if(op==="menu.update"){
  if(!validUuid(body.id)) throw new Error("Invalid menu item id")
  const name=String(body.name||"").trim(), category=String(body.category||"").trim(), price=Number(body.price)
  if(!name||!category||!Number.isFinite(price)) throw new Error("Invalid menu item")
  const rows=await localReturning(`UPDATE "menu_items" SET name=${sqlText(name)},price=${price},category=${sqlText(category)},description=${sqlText(body.description==null?null:String(body.description))},image=COALESCE(${sqlText(body.image==null?null:String(body.image))},image) WHERE id=${sqlText(body.id)} AND restaurant_id=${sqlText(id)} RETURNING *`)
  if(!rows[0]) throw new Error("Menu item not found")
  return rows[0]
 }
 if(op==="menu.delete"){
  if(!validUuid(body.id)) throw new Error("Invalid menu item id")
  await localSql(`DELETE FROM "order_items" WHERE menu_item_id=${sqlText(body.id)} AND EXISTS (SELECT 1 FROM "menu_items" WHERE id=${sqlText(body.id)} AND restaurant_id=${sqlText(id)});`)
  const rows=await localReturning(`DELETE FROM "menu_items" WHERE id=${sqlText(body.id)} AND restaurant_id=${sqlText(id)} RETURNING id`)
  if(!rows[0]) throw new Error("Menu item not found")
  return rows[0]
 }
 if(op==="banner.insert"){
  const url=String(body.image_url||"").trim()
  if(!url) throw new Error("Image URL is required")
  const so=Number(body.sort_order)
  const extra=Number.isInteger(so)?`,${so}`:""
  return (await localReturning(`INSERT INTO "restaurant_banners" (restaurant_id,image_url${extra?",sort_order":""}) VALUES (${sqlText(id)},${sqlText(url)}${extra}) RETURNING *`))[0]
 }
 if(op==="banner.update"){
  if(!validUuid(body.id)) throw new Error("Invalid banner id")
  const url=String(body.image_url||"").trim()
  if(!url) throw new Error("Image URL is required")
  const rows=await localReturning(`UPDATE "restaurant_banners" SET image_url=${sqlText(url)} WHERE id=${sqlText(body.id)} AND restaurant_id=${sqlText(id)} RETURNING *`)
  if(!rows[0]) throw new Error("Banner not found")
  return rows[0]
 }
  if(op==="banner.delete"){
  if(!validUuid(body.id)) throw new Error("Invalid banner id")
  const rows=await localReturning(`
    DELETE FROM "restaurant_banners"
    WHERE id=${sqlText(body.id)}
      AND restaurant_id=${sqlText(id)}
    RETURNING id
  `)
  if(!rows[0]) throw new Error("Banner not found")
  return rows[0]
 }
throw new Error(`Unsupported local admin operation: ${op}`)
}
export async function GET(req){try{if(!localDbEnabled())return Response.json({success:false,enabled:false,error:"Local database is disabled"},{status:503});const u=await requireApiUser(req),id=await resolveRestaurant(u,new URL(req.url).searchParams.get("restaurant_id"));return Response.json({success:true,enabled:true,...await readLocal(id)},{headers:{"Cache-Control":"private,no-store"}})}catch(e){return Response.json({success:false,error:e?.message||"Local admin read failed"},{status:400})}}
export async function POST(req){try{if(!localDbEnabled())return Response.json({success:false,enabled:false,error:"Local database is disabled"},{status:503});const u=await requireApiUser(req),body=await req.json(),id=await resolveRestaurant(u,body?.restaurant_id);return Response.json({success:true,enabled:true,data:await writeLocal(body,id)})}catch(e){console.error("LOCAL ADMIN ERROR:",e);return Response.json({success:false,error:e?.message||"Local admin operation failed"},{status:400})}}
