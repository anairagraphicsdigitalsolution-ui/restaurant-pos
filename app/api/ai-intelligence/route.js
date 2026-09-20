import { requireFeature } from "@/lib/featureGateServer"
import { NextResponse } from 'next/server';
import { requireApiUser, resolveRestaurantForUser, requireStaffPermission } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseServer';

async function ctx(req){ const c=await requireApiUser(req); const restaurantId=await resolveRestaurantForUser(c); await requireFeature(restaurantId, "p2-ai-intelligence"); await requireStaffPermission(c,'reports'); return {c,restaurantId}; }
export async function GET(req){
  try{ const {restaurantId}=await ctx(req); const u=new URL(req.url); const runId=u.searchParams.get('run_id');
    const [ds,fc,rec,risk,ins,runs]=await Promise.all([
      supabaseAdmin.from('p2_6_ai_datasets').select('*').eq('restaurant_id',restaurantId).order('dataset_type'),
      supabaseAdmin.from('p2_6_forecasts').select('*').eq('restaurant_id',restaurantId).order('forecast_date').limit(300),
      supabaseAdmin.from('p2_6_recommendations').select('*').eq('restaurant_id',restaurantId).order('created_at',{ascending:false}).limit(200),
      supabaseAdmin.from('p2_6_risk_signals').select('*').eq('restaurant_id',restaurantId).order('created_at',{ascending:false}).limit(200),
      supabaseAdmin.from('p2_6_business_insights').select('*').eq('restaurant_id',restaurantId).order('created_at',{ascending:false}).limit(200),
      supabaseAdmin.from('p2_6_model_runs').select('*').eq('restaurant_id',restaurantId).order('created_at',{ascending:false}).limit(50)
    ]);
    for(const x of [ds,fc,rec,risk,ins,runs]) if(x.error) throw x.error;
    let backtests=[]; if(runId){const b=await supabaseAdmin.from('p2_6_backtests').select('*').eq('restaurant_id',restaurantId).eq('model_run_id',runId).order('forecast_date'); if(b.error) throw b.error; backtests=b.data||[];}
    return NextResponse.json({datasets:ds.data||[],forecasts:fc.data||[],recommendations:rec.data||[],risks:risk.data||[],insights:ins.data||[],modelRuns:runs.data||[],backtests});
  }catch(e){return NextResponse.json({error:e.message},{status:e.status||400})}
}
export async function POST(req){
  try{ const {restaurantId}=await ctx(req); const b=await req.json(); let data,error;
    if(b.action==='build') ({data,error}=await supabaseAdmin.rpc('p2_6_build_intelligence',{p_restaurant_id:restaurantId,p_days:Number(b.days)||90}));
    else if(b.action==='train_backtest') ({data,error}=await supabaseAdmin.rpc('p2_6_train_backtest_sales',{p_restaurant_id:restaurantId,p_history_days:Number(b.history_days)||180,p_test_days:Number(b.test_days)||28}));
    else if(b.action==='approve') ({data,error}=await supabaseAdmin.rpc('p2_6_approve_recommendation',{p_restaurant_id:restaurantId,p_recommendation_id:b.id,p_approve:Boolean(b.approve)}));
    else if(b.action==='execute'){if(!b.execution_ref)return NextResponse.json({error:'execution_ref required'},{status:400}); ({data,error}=await supabaseAdmin.rpc('p2_6_mark_executed',{p_restaurant_id:restaurantId,p_recommendation_id:b.id,p_execution_ref:b.execution_ref}));}
    else return NextResponse.json({error:'Unknown action'},{status:400});
    if(error) throw error; return NextResponse.json(data);
  }catch(e){return NextResponse.json({error:e.message},{status:e.status||400})}
}
