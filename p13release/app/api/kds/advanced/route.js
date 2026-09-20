import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/serverAuth'
import { resolveRestaurantForUser } from '@/lib/restaurantAccess'
import { createClient } from '@/lib/supabase/server'

export async function GET(request){
  try{
    const user=await requireApiUser(request)
    const restaurantId=await resolveRestaurantForUser(user)
    if(!restaurantId) return NextResponse.json({error:'Restaurant not found'},{status:403})
    const supabase=createClient()
    const {data,error}=await supabase.from('kds_tickets').select('*,kitchen_stations(name)').eq('restaurant_id',restaurantId).in('status',['new','accepted','preparing','ready']).order('priority',{ascending:false}).order('created_at',{ascending:true}).limit(200)
    if(error) throw error
    return NextResponse.json({tickets:(data||[]).map(x=>({...x,station_name:x.kitchen_stations?.name||null,kitchen_stations:undefined}))})
  }catch(e){return NextResponse.json({error:e?.message||'KDS error'},{status:500})}
}

export async function POST(request){
  try{
    const user=await requireApiUser(request)
    const restaurantId=await resolveRestaurantForUser(user)
    if(!restaurantId) return NextResponse.json({error:'Restaurant not found'},{status:403})
    const body=await request.json()
    const supabase=createClient()
    const {data,error}=await supabase.rpc('p1_5_update_kds_ticket',{p_restaurant_id:restaurantId,p_ticket_id:body.ticket_id,p_status:body.status,p_station_id:body.station_id||null,p_priority:body.priority||null})
    if(error) throw error
    return NextResponse.json(data)
  }catch(e){return NextResponse.json({error:e?.message||'KDS update failed'},{status:500})}
}
