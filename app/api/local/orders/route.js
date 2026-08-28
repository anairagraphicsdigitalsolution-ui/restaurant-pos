import crypto from "node:crypto"
import { localDbEnabled, localJson, localOne, localSql, sqlJson, sqlText } from "@/lib/localDb"
import { requireLocalRestaurant } from "@/lib/localTenant"
export const runtime = "nodejs"
function guard(){ if(!localDbEnabled()) throw new Error("Local database is disabled") }
export async function GET(req){
  try {
    guard()
    const u=new URL(req.url)
    const { restaurantId: rid } = await requireLocalRestaurant(req, u.searchParams.get("restaurant_id"))
    const rows=await localJson(`SELECT o.*, COALESCE(json_agg(oi ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL),'[]') AS items FROM orders o LEFT JOIN order_items oi ON oi.order_id=o.id WHERE o.restaurant_id=${sqlText(rid)} GROUP BY o.id ORDER BY o.created_at DESC LIMIT 500`)
    return Response.json({success:true,orders:rows})
  } catch(e){ return Response.json({success:false,error:e.message},{status:400}) }
}
export async function POST(req){
  try {
    guard()
    const b=await req.json()
    const { restaurantId: rid } = await requireLocalRestaurant(req, String(b.restaurant_id||"").trim() || null)
    const id=b.id||crypto.randomUUID(); const items=Array.isArray(b.items)?b.items:[]; const status="pending"; const subtotal=Number(b.subtotal||0), discount=Number(b.discount_amount||0), tax=Number(b.tax_amount||0), total=Number(b.total_amount ?? subtotal-discount+tax); await localSql(`BEGIN; INSERT INTO orders (id,source_type,source_id,status,created_at,restaurant_id,source_label,overall_note,subtotal,discount_amount,tax_amount,total_amount,payment_status,updated_at) VALUES (${sqlText(id)},${sqlText(b.source_type||"table")},${sqlText(b.source_id||"")},${sqlText(status)},COALESCE(${sqlText(b.created_at)},now()),${sqlText(rid)},${sqlText(b.source_label||null)},${sqlText(b.overall_note||null)},${subtotal},${discount},${tax},${total},'unpaid',now()) ON CONFLICT (id) DO NOTHING; ${items.map((x,i)=>`INSERT INTO order_items (id,order_id,item_id,quantity,cooking_request,item_name,unit_price,line_total) VALUES (${sqlText(x.id||crypto.randomUUID())},${sqlText(id)},${sqlText(x.item_id||null)},${Number(x.quantity||1)},${sqlText(x.cooking_request||null)},${sqlText(x.item_name||x.name||"Item")},${Number(x.unit_price||0)},${Number(x.line_total||0)});`).join(" ")} INSERT INTO local_sync_outbox(entity,entity_id,operation,restaurant_id,payload) VALUES ('orders',${sqlText(id)},'upsert',${sqlText(rid)},${sqlJson({id,...b,status,subtotal,discount_amount:discount,tax_amount:tax,total_amount:total})}) ON CONFLICT DO NOTHING; COMMIT;`); const order=await localOne(`SELECT * FROM orders WHERE id=${sqlText(id)}`); return Response.json({success:true,order}) } catch(e){ try{await localSql("ROLLBACK;")}catch{} return Response.json({success:false,error:e.message},{status:400}) }
}
