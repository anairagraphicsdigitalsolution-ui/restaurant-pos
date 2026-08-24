import { supabaseAdmin } from "@/lib/supabaseServer"

export const runtime = "nodejs"

export async function GET(req){
  try{
    const slug=new URL(req.url).searchParams.get("slug")?.trim()
    if(!slug)return Response.json({success:false,error:"Restaurant slug required"},{status:400})
    const {data:restaurant,error}=await supabaseAdmin.from("restaurants")
      .select("id,name,slug,logo,description,cuisine,gst_enabled,gst_rate")
      .eq("slug",slug).maybeSingle()
    if(error||!restaurant)return Response.json({success:false,error:"Restaurant not found"},{status:404})
    const {data:menu}=await supabaseAdmin.from("menu_items")
      .select("id,name,price,category,image,description,active")
      .eq("restaurant_id",restaurant.id).eq("active",true)
      .order("category").order("name")
    return Response.json({success:true,restaurant,menu:menu||[]},{
      headers:{"Cache-Control":"public,max-age=30,stale-while-revalidate=60"}
    })
  }catch(e){
    return Response.json({success:false,error:e.message||"Unable to load website ordering"},{status:500})
  }
}
