import { requireApiUser } from "@/lib/serverAuth"
import { requireFeature } from "@/lib/featureGateServer"
import { supabaseCloudAdmin, supabaseCloudUser } from "@/lib/supabaseCloudServer"
import { NextResponse } from "next/server"

const json=(x,s=200)=>NextResponse.json(x,{status:s})

function clean(v,max=300){ return String(v??"").trim().slice(0,max) }

async function ctx(req){
  const user=await requireApiUser(req)
  const bearer=req.headers.get("authorization")||""
  const accessToken=bearer.startsWith("Bearer ")?bearer.slice(7).trim():""
  const userDb=supabaseCloudUser(accessToken)
  const requestedId=new URL(req.url).searchParams.get("enterprise_id")

  if(user.role!=="super_admin" && user.restaurant_id) await requireFeature(user.restaurant_id,"p1-enterprise-hq")

  let id=requestedId
  let memberRole=null

  if(user.role==="super_admin" && id) memberRole="super_admin"
  else {
    const {data:m,error}=await supabaseCloudAdmin.from("enterprise_members").select("enterprise_id,role").eq("user_id",user.id).limit(1).maybeSingle()
    if(error) throw error
    if(m){ if(id && m.enterprise_id!==id) throw Object.assign(new Error("Enterprise access denied"),{status:403}); id=m.enterprise_id; memberRole=m.role }
  }

  if(!id && user.role!=="super_admin" && user.restaurant_id){
    const {data:owned,error:oe}=await supabaseCloudAdmin.from("restaurants").select("id,owner_id").eq("id",user.restaurant_id).maybeSingle()
    if(oe) throw oe
    if(owned?.owner_id===user.id){
      const {data:link,error:le}=await supabaseCloudAdmin.from("enterprise_outlets").select("enterprise_id").eq("restaurant_id",user.restaurant_id).limit(1).maybeSingle()
      if(le) throw le
      if(link){ id=link.enterprise_id; memberRole="owner" }
    }
  }
  if(!id) throw Object.assign(new Error("Enterprise membership not found"),{status:403})
  if(!memberRole) memberRole="viewer"
  return {user,id,role:memberRole,userDb}
}

async function requireEnterpriseAdmin(user,id,role){
  if(user.role==="super_admin" || ["owner","enterprise_admin"].includes(role)) return
  throw Object.assign(new Error("Enterprise admin access required"),{status:403})
}

async function seedOutletPlugins(restaurantId, sourceRestaurantId=null){
  if(sourceRestaurantId){
    const {data:source}=await supabaseCloudAdmin.from("restaurant_plugins").select("plugin_code,plugin_slug,enabled,config,display_name,category,description,feature_kind").eq("restaurant_id",sourceRestaurantId)
    if(source?.length){
      const rows=source.map(x=>({...x,restaurant_id:restaurantId}))
      await supabaseCloudAdmin.from("restaurant_plugins").upsert(rows,{onConflict:"restaurant_id,plugin_code"})
      await supabaseCloudAdmin.from("restaurant_plugins").update({enabled:false}).eq("restaurant_id",restaurantId).eq("plugin_code","p1-enterprise-hq")
      return
    }
  }
  const {data:catalog}=await supabaseCloudAdmin.from("plugin_catalog").select("code,name,category,description,kind").eq("active",true)
  if(!catalog?.length) return
  const rows=catalog.map(c=>({restaurant_id:restaurantId,plugin_code:c.code,plugin_slug:c.code,enabled:false,config:{},display_name:c.name,category:c.category,description:c.description,feature_kind:c.kind}))
  await supabaseCloudAdmin.from("restaurant_plugins").upsert(rows,{onConflict:"restaurant_id,plugin_code"})
  await supabaseCloudAdmin.from("restaurant_plugins").update({enabled:false}).eq("restaurant_id",restaurantId).eq("plugin_code","p1-enterprise-hq")
}


async function cloneOperationalSetup(sourceRestaurantId,targetRestaurantId,enterpriseId){
  if(!sourceRestaurantId || sourceRestaurantId===targetRestaurantId) return {menu:0,variants:0,modifiers:0,tables:0,stations:0}

  const [{data:sourceRestaurant},{data:sourceItems},{data:sourceVariants},{data:sourceGroups},{data:sourceModifiers},{data:sourceLinks},{data:sourceFloors},{data:sourceTables},{data:sourceStations},{data:sourceInventory},{data:sourceRecipes},{data:sourceSub}] = await Promise.all([
    supabaseCloudAdmin.from("restaurants").select("logo,cuisine,description,address,gst,gst_number,opening_time,theme_config,service_charge_enabled,service_charge_percent,default_tax_percent,delivery_enabled,tip_enabled,min_delivery_order,currency").eq("id",sourceRestaurantId).maybeSingle(),
    supabaseCloudAdmin.from("menu_items").select("id,name,price,category,image,description,item_type,combo_config").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("menu_variants").select("id,menu_item_id,name,price_delta,active").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("modifier_groups").select("id,name,selection_type,required,min_select,max_select,active").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("modifiers").select("id,group_id,name,price,active").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("menu_item_modifier_groups").select("menu_item_id,modifier_group_id").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("floors").select("name,display_order,active").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("tables").select("table_number,seats,floor,section,shape,position_x,position_y,qr_enabled").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("kitchen_stations").select("name,station_type,active,sort_order").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("inventory").select("id,name,unit,category,supplier,min_stock,sku,cost_price,reorder_level,costing_method,standard_yield_qty,notes").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("restaurant_recipes").select("id,menu_item_id,yield_qty,notes").eq("restaurant_id",sourceRestaurantId),
    supabaseCloudAdmin.from("restaurant_subscriptions").select("plan_id,saas_plan_id,status,starts_at,expires_at,billing_cycle,trial_ends_at,ends_at").eq("restaurant_id",sourceRestaurantId).order("created_at",{ascending:false}).limit(1).maybeSingle()
  ])

  if(sourceRestaurant) await supabaseCloudAdmin.from("restaurants").update({...sourceRestaurant}).eq("id",targetRestaurantId)

  // Every enterprise outlet gets its own subscription record.
  // The outlet may inherit the main branch's plan as a preselection,
  // but activation is deliberately left to Super Admin.
  if(sourceSub){
    const { error: subSeedError } = await supabaseCloudAdmin.from("restaurant_subscriptions").insert({
      restaurant_id: targetRestaurantId,
      plan_id: sourceSub.plan_id || null,
      saas_plan_id: sourceSub.saas_plan_id || null,
      status: "pending",
      starts_at: null,
      expires_at: null,
      billing_cycle: sourceSub.billing_cycle || "monthly",
      trial_ends_at: null,
      ends_at: null,
      updated_at: new Date().toISOString()
    })
    if(subSeedError) throw subSeedError
  } else {
    const { error: subSeedError } = await supabaseCloudAdmin.from("restaurant_subscriptions").insert({
      restaurant_id: targetRestaurantId,
      plan_id: null,
      saas_plan_id: null,
      status: "pending",
      starts_at: null,
      expires_at: null,
      billing_cycle: "monthly",
      trial_ends_at: null,
      ends_at: null,
      updated_at: new Date().toISOString()
    })
    if(subSeedError) throw subSeedError
  }

  const itemMap=new Map(), catalogMap=new Map()
  for(const item of sourceItems||[]){
    const {data:catalog}=await supabaseCloudAdmin.from("enterprise_menu_catalog").insert({
      enterprise_id:enterpriseId,name:item.name,category:item.category||null,description:item.description||null,image:item.image||null,base_price:Number(item.price||0),active:true,
      source_restaurant_id:sourceRestaurantId,source_menu_item_id:item.id
    }).select().single()
    if(!catalog) continue
    catalogMap.set(item.id,catalog.id)
    const {data:targetItem}=await supabaseCloudAdmin.from("menu_items").insert({
      restaurant_id:targetRestaurantId,name:item.name,price:item.price,category:item.category,image:item.image,description:item.description,item_type:item.item_type||"single",combo_config:item.combo_config||null,enterprise_catalog_item_id:catalog.id
    }).select("id").single()
    if(targetItem) itemMap.set(item.id,targetItem.id)
  }

  const inventoryMap=new Map()
  for(const inv of sourceInventory||[]){
    const {data:ni}=await supabaseCloudAdmin.from("inventory").insert({restaurant_id:targetRestaurantId,name:inv.name,quantity:0,unit:inv.unit,category:inv.category,supplier:inv.supplier,min_stock:inv.min_stock,sku:inv.sku,cost_price:inv.cost_price,reorder_level:inv.reorder_level,costing_method:inv.costing_method,standard_yield_qty:inv.standard_yield_qty,notes:inv.notes}).select("id").single()
    if(ni) inventoryMap.set(inv.id,ni.id)
  }
  const recipeIds=(sourceRecipes||[]).map(x=>x.id)
  let sourceRecipeItems=[]
  if(recipeIds.length){
    const {data:ri}=await supabaseCloudAdmin.from("restaurant_recipe_items").select("recipe_id,inventory_id,quantity,unit").in("recipe_id",recipeIds)
    sourceRecipeItems=ri||[]
  }
  for(const recipe of sourceRecipes||[]){
    const newMenuId=itemMap.get(recipe.menu_item_id)
    if(!newMenuId) continue
    const {data:nr}=await supabaseCloudAdmin.from("restaurant_recipes").insert({restaurant_id:targetRestaurantId,menu_item_id:newMenuId,yield_qty:recipe.yield_qty,notes:recipe.notes}).select("id").single()
    if(!nr) continue
    const lines=sourceRecipeItems.filter(x=>x.recipe_id===recipe.id).map(x=>({recipe_id:nr.id,inventory_id:inventoryMap.get(x.inventory_id),quantity:x.quantity,unit:x.unit})).filter(x=>x.inventory_id)
    if(lines.length) await supabaseCloudAdmin.from("restaurant_recipe_items").insert(lines)
  }

  for(const item of sourceItems||[]){
    if(String(item.item_type||"")!=="combo" || !item.combo_config) continue
    const newId=itemMap.get(item.id)
    if(!newId) continue
    const remap=(value)=>{
      if(Array.isArray(value)) return value.map(remap)
      if(value && typeof value==="object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v)]))
      if(typeof value==="string" && itemMap.has(value)) return itemMap.get(value)
      return value
    }
    await supabaseCloudAdmin.from("menu_items").update({combo_config:remap(item.combo_config)}).eq("id",newId).eq("restaurant_id",targetRestaurantId)
  }

  const groupMap=new Map()
  for(const g of sourceGroups||[]){
    const {data:ng}=await supabaseCloudAdmin.from("modifier_groups").insert({restaurant_id:targetRestaurantId,name:g.name,selection_type:g.selection_type,required:g.required,min_select:g.min_select,max_select:g.max_select,active:g.active}).select("id").single()
    if(ng) groupMap.set(g.id,ng.id)
  }
  for(const m of sourceModifiers||[]){
    const ng=groupMap.get(m.group_id)
    if(ng) await supabaseCloudAdmin.from("modifiers").insert({restaurant_id:targetRestaurantId,group_id:ng,name:m.name,price:m.price,active:m.active})
  }
  for(const l of sourceLinks||[]){
    const ni=itemMap.get(l.menu_item_id), ng=groupMap.get(l.modifier_group_id)
    if(ni&&ng) await supabaseCloudAdmin.from("menu_item_modifier_groups").insert({restaurant_id:targetRestaurantId,menu_item_id:ni,modifier_group_id:ng})
  }
  for(const v of sourceVariants||[]){
    const ni=itemMap.get(v.menu_item_id)
    if(ni) await supabaseCloudAdmin.from("menu_variants").insert({restaurant_id:targetRestaurantId,menu_item_id:ni,name:v.name,price_delta:v.price_delta,active:v.active})
  }
  if((sourceFloors||[]).length) await supabaseCloudAdmin.from("floors").insert((sourceFloors||[]).map(x=>({...x,restaurant_id:targetRestaurantId})))
  if((sourceTables||[]).length) await supabaseCloudAdmin.from("tables").insert((sourceTables||[]).map(x=>({...x,restaurant_id:targetRestaurantId,status:"available",waiter_id:null})))
  if((sourceStations||[]).length) await supabaseCloudAdmin.from("kitchen_stations").insert((sourceStations||[]).map(x=>({...x,restaurant_id:targetRestaurantId})))

  return {menu:itemMap.size,variants:(sourceVariants||[]).length,modifiers:(sourceModifiers||[]).length,tables:(sourceTables||[]).length,stations:(sourceStations||[]).length,inventory:(sourceInventory||[]).length,recipes:(sourceRecipes||[]).length}
}

async function provisionAdmin({email,password,username,name,restaurantId,role="admin"}){
  if(!email) return null
  const existing=await supabaseCloudAdmin.auth.admin.listUsers({page:1,perPage:1000})
  const found=existing.data?.users?.find(u=>String(u.email||"").toLowerCase()===email.toLowerCase())
  let authUser=found
  if(authUser){
    const {data:existingProfile}=await supabaseCloudAdmin.from("profiles").select("id,restaurant_id,role").eq("id",authUser.id).maybeSingle()
    if(existingProfile?.restaurant_id && existingProfile.restaurant_id!==restaurantId)
      throw Object.assign(new Error("This email is already assigned to another restaurant"),{status:409})
  }
  if(!authUser){
    const {data,error}=await supabaseCloudAdmin.auth.admin.createUser({email,password:password||undefined,email_confirm:true,user_metadata:{name,role,restaurant_id:restaurantId}})
    if(error) throw Object.assign(new Error(error.message),{status:400})
    authUser=data.user
  } else {
    if(password) await supabaseCloudAdmin.auth.admin.updateUserById(authUser.id,{password})
    await supabaseCloudAdmin.auth.admin.updateUserById(authUser.id,{user_metadata:{...(authUser.user_metadata||{}),name,role,restaurant_id:restaurantId}})
  }
  const {error:pe}=await supabaseCloudAdmin.from("profiles").upsert({id:authUser.id,role,restaurant_id:restaurantId,email:email||authUser.email,username:username||null,display_name:name||null},{onConflict:"id"})
  if(pe) throw Object.assign(new Error(`Outlet admin profile failed: ${pe.message}`),{status:400})
  return authUser
}


async function publishCatalogItemToRestaurant(item, restaurantId){
  let targetItem
  const {data:existing}=await supabaseCloudAdmin.from("menu_items").select("id").eq("restaurant_id",restaurantId).eq("enterprise_catalog_item_id",item.id).maybeSingle()
  const payload={restaurant_id:restaurantId,name:item.name,price:Number(item.base_price||0),category:item.category||null,image:item.image||null,description:item.description||null,item_type:"single",enterprise_catalog_item_id:item.id}
  if(existing){
    const {data:x,error}=await supabaseCloudAdmin.from("menu_items").update(payload).eq("id",existing.id).select("id").single()
    if(error) throw error
    targetItem=x
  } else {
    const {data:x,error}=await supabaseCloudAdmin.from("menu_items").insert(payload).select("id").single()
    if(error) throw error
    targetItem=x
  }
  if(item.source_restaurant_id && item.source_menu_item_id){
    const [{data:sv},{data:sg},{data:sm},{data:sl}]=await Promise.all([
      supabaseCloudAdmin.from("menu_variants").select("name,price_delta,active").eq("restaurant_id",item.source_restaurant_id).eq("menu_item_id",item.source_menu_item_id),
      supabaseCloudAdmin.from("modifier_groups").select("id,name,selection_type,required,min_select,max_select,active").eq("restaurant_id",item.source_restaurant_id),
      supabaseCloudAdmin.from("modifiers").select("group_id,name,price,active").eq("restaurant_id",item.source_restaurant_id),
      supabaseCloudAdmin.from("menu_item_modifier_groups").select("modifier_group_id").eq("restaurant_id",item.source_restaurant_id).eq("menu_item_id",item.source_menu_item_id)
    ])
    if((sv||[]).length){
      await supabaseCloudAdmin.from("menu_variants").delete().eq("restaurant_id",restaurantId).eq("menu_item_id",targetItem.id)
      await supabaseCloudAdmin.from("menu_variants").insert((sv||[]).map(v=>({...v,restaurant_id:restaurantId,menu_item_id:targetItem.id})))
    }
    const linkedGroupIds=new Set((sl||[]).map(x=>x.modifier_group_id))
    await supabaseCloudAdmin.from("menu_item_modifier_groups").delete().eq("restaurant_id",restaurantId).eq("menu_item_id",targetItem.id)
    for(const g of (sg||[]).filter(x=>linkedGroupIds.has(x.id))){
      let {data:ng}=await supabaseCloudAdmin.from("modifier_groups").select("id").eq("restaurant_id",restaurantId).eq("name",g.name).maybeSingle()
      if(!ng){
        const res=await supabaseCloudAdmin.from("modifier_groups").insert({restaurant_id:restaurantId,name:g.name,selection_type:g.selection_type,required:g.required,min_select:g.min_select,max_select:g.max_select,active:g.active}).select("id").single()
        ng=res.data
      }
      if(!ng) continue
      await supabaseCloudAdmin.from("modifiers").delete().eq("restaurant_id",restaurantId).eq("group_id",ng.id)
      const groupMods=(sm||[]).filter(m=>m.group_id===g.id)
      if(groupMods.length) await supabaseCloudAdmin.from("modifiers").insert(groupMods.map(m=>({restaurant_id:restaurantId,group_id:ng.id,name:m.name,price:m.price,active:m.active})))
      await supabaseCloudAdmin.from("menu_item_modifier_groups").insert({restaurant_id:restaurantId,menu_item_id:targetItem.id,modifier_group_id:ng.id})
    }
  }
  return targetItem
}
export async function GET(req){
  try{
    const {id,user,role,userDb}=await ctx(req)
    const u=new URL(req.url), days=Math.min(Math.max(Number(u.searchParams.get("days")||30),1),365), tab=u.searchParams.get("tab")||"summary"

    if(tab==="outlet_options"){
      await requireEnterpriseAdmin(user,id,role)
      const {data:linked,error:le}=await supabaseCloudAdmin.from("enterprise_outlets").select("restaurant_id").eq("enterprise_id",id)
      if(le)throw le
      const linkedIds=(linked||[]).map(x=>x.restaurant_id)
      let q=supabaseCloudAdmin.from("restaurants").select("id,name,code,owner_id,status").eq("status","active")
      if(user.role!=="super_admin") q=q.eq("owner_id",user.id)
      const {data:restaurants,error}=await q
      if(error)throw error
      return json({success:true,restaurants:(restaurants||[]).filter(r=>!linkedIds.includes(r.id))})
    }

    if(tab==="live_operations"){
      const restaurantId=u.searchParams.get("restaurant_id")||null
      const limit=Math.min(Math.max(Number(u.searchParams.get("recent_limit")||40),5),100)
      const {data,error}=await userDb.rpc("p1_8_live_operations",{p_enterprise_id:id,p_restaurant_id:restaurantId,p_recent_limit:limit})
      if(error)throw error
      return json({success:true,data,enterprise_id:id,role})
    }

    if(tab==="outlet_context"){
      const {data:outlet}=await supabaseCloudAdmin.from("enterprise_outlets").select("id,enterprise_id,restaurant_id,outlet_code,outlet_name,is_active,admin_user_id,admin_email").eq("enterprise_id",id).eq("restaurant_id",user.restaurant_id).maybeSingle()
      return json({success:true,outlet:outlet||null})
    }

    if(tab==="reports"){
      const {data,error}=await userDb.rpc("p1_8_consolidated_reports",{p_enterprise_id:id,p_start:u.searchParams.get("start"),p_end:u.searchParams.get("end")})
      if(error)throw error
      return json({success:true,data,enterprise_id:id,role})
    }
    if(tab==="accounting"){
      const {data,error}=await userDb.rpc("p1_8_group_accounting",{p_enterprise_id:id,p_start:u.searchParams.get("start"),p_end:u.searchParams.get("end")})
      if(error)throw error
      return json({success:true,data,enterprise_id:id,role})
    }

    const {data,error}=await userDb.rpc("p1_8_hq_summary",{p_enterprise_id:id,p_days:days})
    if(error)throw error
    return json({success:true,...data,enterprise_id:id,role})
  }catch(e){
    return json({success:false,error:e?.message||"Enterprise HQ error"},e?.status||(/access denied|not authorized|membership not found/i.test(e?.message||"")?403:500))
  }
}

export async function POST(req){
  try{
    const {user,id,role,userDb}=await ctx(req)
    const b=await req.json(), action=String(b.action||"")
    let data,error

    if(action==="outlet_provision"){
      await requireEnterpriseAdmin(user,id,role)
      const mode=clean(b.mode,20)||"new"
      const outletName=clean(b.outlet_name,150), outletCode=clean(b.outlet_code,60).toUpperCase()
      const email=clean(b.admin_email,200).toLowerCase(), adminName=clean(b.admin_name,150), adminUsername=clean(b.admin_username,80).toLowerCase().replace(/[^a-z0-9._-]/g,"")
      const password=clean(b.admin_password,200)
      if(!outletName||!outletCode||!email||!adminName||!adminUsername) throw Object.assign(new Error("Outlet name, code, admin name, username and admin email are required"),{status:400})
      const {data:usernameTaken}=await supabaseCloudAdmin.from("profiles").select("id").ilike("username",adminUsername).maybeSingle()
      if(usernameTaken) throw Object.assign(new Error("This username is already in use"),{status:409})
      if(password && password.length<8) throw Object.assign(new Error("Password must be at least 8 characters"),{status:400})

      let restaurantId=clean(b.restaurant_id,100)
      let restaurant
      if(mode==="existing"){
        if(!restaurantId) throw Object.assign(new Error("Select an existing restaurant"),{status:400})
        const {data:r,error:re}=await supabaseCloudAdmin.from("restaurants").select("id,name,code,owner_id,status").eq("id",restaurantId).maybeSingle()
        if(re)throw re
        if(!r)throw Object.assign(new Error("Restaurant not found"),{status:404})
        if(user.role!=="super_admin" && r.owner_id!==user.id) throw Object.assign(new Error("You can only connect a restaurant you own"),{status:403})
        restaurant=r
      } else {
        const {data:r,error:re}=await supabaseCloudAdmin.from("restaurants").insert({name:outletName,owner_name:adminName,status:"active"}).select().single()
        if(re)throw re
        restaurant=r; restaurantId=r.id
        try { await seedOutletPlugins(restaurantId, user.restaurant_id||null); await cloneOperationalSetup(user.restaurant_id||null,restaurantId,id) } catch(e) { await supabaseCloudAdmin.from("restaurant_subscriptions").delete().eq("restaurant_id",restaurantId); await supabaseCloudAdmin.from("restaurants").delete().eq("id",restaurantId); throw e }
      }

      const {data:existingOutlet,error:existingOutletError}=await supabaseCloudAdmin.from("enterprise_outlets").select("id").eq("enterprise_id",id).eq("restaurant_id",restaurantId).maybeSingle()
      if(existingOutletError) throw existingOutletError
      if(existingOutlet) throw Object.assign(new Error("This restaurant is already linked to this Enterprise"),{status:409})
      const adminUser=await provisionAdmin({email,password,username:adminUsername,name:adminName,restaurantId,role:"admin"})
      if(!adminUser) throw Object.assign(new Error("Outlet admin could not be provisioned"),{status:400})
      if(mode==="new"){
        const {error:oe}=await supabaseCloudAdmin.from("restaurants").update({owner_id:adminUser.id}).eq("id",restaurantId)
        if(oe)throw oe
      }
      const isFirstOutlet = !(await supabaseCloudAdmin.from("enterprise_outlets").select("id",{count:"exact",head:true}).eq("enterprise_id",id)).count
      const {data:outlet,error:oe}=await supabaseCloudAdmin.from("enterprise_outlets").insert({enterprise_id:id,restaurant_id:restaurantId,outlet_code:outletCode,outlet_name:outletName,is_active:true,is_main_branch:Boolean(isFirstOutlet),admin_user_id:adminUser.id,admin_email:email,admin_username:adminUsername,provisioned_at:new Date().toISOString(),provisioned_by:user.id}).select().single()
      if(oe)throw oe
      data={outlet,restaurant:{id:restaurantId,name:restaurant.name},admin:{id:adminUser.id,email,username:adminUsername,role:"admin"}}
    }
    else if(action==="outlet_add"){
      await requireEnterpriseAdmin(user,id,role)
      const restaurantId=clean(b.restaurant_id,100)
      if(!restaurantId) throw Object.assign(new Error("restaurant_id is required"),{status:400})
      const {data:restaurant,error:re}=await supabaseCloudAdmin.from("restaurants").select("id,name,code,owner_id,status").eq("id",restaurantId).maybeSingle()
      if(re)throw re
      if(!restaurant)throw Object.assign(new Error("Restaurant not found"),{status:404})
      if(user.role!=="super_admin" && restaurant.owner_id!==user.id) throw Object.assign(new Error("You can only add a restaurant you own"),{status:403})
      const {data:existing,error:ee}=await supabaseCloudAdmin.from("enterprise_outlets").select("id").eq("enterprise_id",id).eq("restaurant_id",restaurantId).maybeSingle()
      if(ee)throw ee
      if(existing)throw Object.assign(new Error("This restaurant is already linked to the Enterprise"),{status:409})
      const {data:existingSub}=await supabaseCloudAdmin.from("restaurant_subscriptions").select("id").eq("restaurant_id",restaurantId).limit(1).maybeSingle()
      if(!existingSub){
        const {data:sourceSub}=await supabaseCloudAdmin.from("restaurant_subscriptions").select("plan_id,saas_plan_id,billing_cycle").eq("restaurant_id",user.restaurant_id||"").order("updated_at",{ascending:false}).limit(1).maybeSingle()
        const {error:subError}=await supabaseCloudAdmin.from("restaurant_subscriptions").insert({restaurant_id:restaurantId,plan_id:sourceSub?.plan_id||null,saas_plan_id:sourceSub?.saas_plan_id||null,status:"pending",starts_at:null,expires_at:null,billing_cycle:sourceSub?.billing_cycle||"monthly",trial_ends_at:null,ends_at:null,updated_at:new Date().toISOString()})
        if(subError)throw subError
      }
      const outletCode=clean(b.outlet_code||restaurant.code||restaurant.id.slice(0,8),60).toUpperCase()
      const {count:existingCount}=await supabaseCloudAdmin.from("enterprise_outlets").select("id",{count:"exact",head:true}).eq("enterprise_id",id)
      const {data:outlet,error}=await supabaseCloudAdmin.from("enterprise_outlets").insert({enterprise_id:id,restaurant_id:restaurantId,outlet_code:outletCode,outlet_name:clean(b.outlet_name||restaurant.name,150),is_active:true,is_main_branch:(existingCount||0)===0}).select().single()
      if(error)throw error
      data=outlet
    }
    else if(action==="menu_publish"){
      await requireEnterpriseAdmin(user,id,role)
      const catalogId=clean(b.catalog_item_id,100)
      const targetIds=Array.isArray(b.restaurant_ids)?b.restaurant_ids.map(String):[]
      if(!catalogId||!targetIds.length) throw Object.assign(new Error("Menu item and at least one outlet are required"),{status:400})
      const {data:item,error:ie}=await supabaseCloudAdmin.from("enterprise_menu_catalog").select("*").eq("id",catalogId).eq("enterprise_id",id).maybeSingle()
      if(ie)throw ie
      if(!item)throw Object.assign(new Error("Central menu item not found"),{status:404})
      const {data:outs,error:oe}=await supabaseCloudAdmin.from("enterprise_outlets").select("restaurant_id").eq("enterprise_id",id).in("restaurant_id",targetIds).eq("is_active",true)
      if(oe)throw oe
      const allowedIds=(outs||[]).map(x=>x.restaurant_id)
      if(!allowedIds.length)throw Object.assign(new Error("No valid enterprise outlets selected"),{status:400})
      for(const restaurantId of allowedIds) await publishCatalogItemToRestaurant(item,restaurantId)
      await supabaseCloudAdmin.from("enterprise_menu_catalog").update({published_at:new Date().toISOString(),published_by:user.id}).eq("id",catalogId).eq("enterprise_id",id)
      data={published_to:allowedIds.length,catalog_item_id:catalogId}
    }
    else if(action==="menu_publish_all"){
      await requireEnterpriseAdmin(user,id,role)
      const {data:items,error:ie}=await supabaseCloudAdmin.from("enterprise_menu_catalog").select("*").eq("enterprise_id",id).eq("active",true)
      if(ie)throw ie
      const {data:outs,error:oe}=await supabaseCloudAdmin.from("enterprise_outlets").select("restaurant_id").eq("enterprise_id",id).eq("is_active",true)
      if(oe)throw oe
      for(const item of items||[]) for(const o of outs||[]) await publishCatalogItemToRestaurant(item,o.restaurant_id)
      await supabaseCloudAdmin.from("enterprise_menu_catalog").update({published_at:new Date().toISOString(),published_by:user.id}).eq("enterprise_id",id)
      data={items_published:(items||[]).length,outlets:(outs||[]).length}
    }
    else if(action==="menu_import_source"){
      await requireEnterpriseAdmin(user,id,role)
      const sourceRestaurantId=String(b.source_restaurant_id||user.restaurant_id||"")
      const {data:outlet}=await supabaseCloudAdmin.from("enterprise_outlets").select("restaurant_id").eq("enterprise_id",id).eq("restaurant_id",sourceRestaurantId).maybeSingle()
      if(!outlet) throw Object.assign(new Error("Source restaurant is not linked to this Enterprise"),{status:403})
      const {data:items,error:ie}=await supabaseCloudAdmin.from("menu_items").select("id,name,price,category,image,description").eq("restaurant_id",sourceRestaurantId)
      if(ie)throw ie
      let imported=0
      for(const item of items||[]){
        const {data:existing}=await supabaseCloudAdmin.from("enterprise_menu_catalog").select("id").eq("enterprise_id",id).eq("source_restaurant_id",sourceRestaurantId).eq("source_menu_item_id",item.id).maybeSingle()
        if(existing) await supabaseCloudAdmin.from("enterprise_menu_catalog").update({name:item.name,category:item.category||null,image:item.image||null,description:item.description||null,base_price:Number(item.price||0),active:true,updated_at:new Date().toISOString()}).eq("id",existing.id)
        else await supabaseCloudAdmin.from("enterprise_menu_catalog").insert({enterprise_id:id,name:item.name,category:item.category||null,image:item.image||null,description:item.description||null,base_price:Number(item.price||0),active:true,source_restaurant_id:sourceRestaurantId,source_menu_item_id:item.id})
        imported++
      }
      data={imported,source_restaurant_id:sourceRestaurantId}
    }
    else if(action==="menu_create"){
      await requireEnterpriseAdmin(user,id,role)
      const payload={enterprise_id:id,name:b.name,category:b.category||null,description:b.description||null,image:b.image||null,base_price:Number(b.base_price||0),active:b.active!==false}
      const {data:x,error:e}=await supabaseCloudAdmin.from("enterprise_menu_catalog").insert(payload).select().single(); data=x;error=e
    }
    else if(action==="menu_update"){
      await requireEnterpriseAdmin(user,id,role)
      const {data:x,error:e}=await supabaseCloudAdmin.from("enterprise_menu_catalog").update({name:b.name,category:b.category||null,description:b.description||null,image:b.image||null,base_price:Number(b.base_price||0),active:b.active!==false,updated_at:new Date().toISOString()}).eq("id",b.id).eq("enterprise_id",id).select().single(); data=x;error=e
    }
    else if(action==="price_upsert"){
      await requireEnterpriseAdmin(user,id,role)
      const {data:x,error:e}=await supabaseCloudAdmin.from("enterprise_menu_prices").upsert({enterprise_id:id,catalog_item_id:b.catalog_item_id,restaurant_id:b.restaurant_id,price:Number(b.price||0),available:b.available!==false,updated_at:new Date().toISOString()},{onConflict:"catalog_item_id,restaurant_id"}).select().single(); data=x;error=e
    }
    else if(action==="transfer_request"){({data,error}=await userDb.rpc("p1_8_request_transfer",{p_enterprise_id:id,p_from:b.from_restaurant_id,p_to:b.to_restaurant_id,p_inventory_id:b.inventory_id||null,p_item_name:b.item_name,p_quantity:Number(b.quantity),p_unit:b.unit||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID(),p_notes:b.notes||null}))}
    else if(action==="transfer_decide"){({data,error}=await userDb.rpc("p1_8_decide_transfer",{p_transfer_id:b.id,p_status:b.status,p_note:b.note||null}))}
    else if(action==="transfer_receive"){({data,error}=await userDb.rpc("p1_8_receive_transfer",{p_transfer_id:b.id}))}
    else if(action==="approval_decide"){({data,error}=await userDb.rpc("p1_8_decide_approval",{p_approval_id:b.id,p_status:b.status,p_note:b.note||null}))}
    else if(action==="staff_move"){({data,error}=await userDb.rpc("p1_8_request_staff_move",{p_enterprise_id:id,p_staff_id:b.staff_id,p_from:b.from_restaurant_id,p_to:b.to_restaurant_id,p_effective_date:b.effective_date||null,p_reason:b.reason||null,p_idempotency_key:b.idempotency_key||crypto.randomUUID()}))}
    else throw Object.assign(new Error("Unknown enterprise HQ action"),{status:400})

    if(error)throw error
    return json({success:true,data})
  }catch(e){
    return json({success:false,error:e?.message||"Enterprise HQ action failed"},e?.status||(/access denied|not authorized/i.test(e?.message||"")?403:400))
  }
}
