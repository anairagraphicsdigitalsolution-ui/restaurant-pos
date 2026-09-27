"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"

const money = (n) => `₹${Number(n||0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
const COLORS = ["#0f766e","#2563eb","#d97706","#7c3aed","#dc2626","#0891b2"]

export default function AdvancedReportsPage() {
  const [days,setDays]=useState(30)
  const [restaurantId,setRestaurantId]=useState("")
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState("")

  useEffect(()=>{
    let cancelled=false
    async function load(){
      setLoading(true); setError("")
      try {
        const {data:auth,error:authError}=await supabaseCloud.auth.getUser()
        if(authError) throw authError
        if(!auth?.user) throw new Error("Please sign in again.")
        const {data:profile,error:profileError}=await supabaseCloud.from("profiles").select("restaurant_id").eq("id",auth.user.id).single()
        if(profileError) throw profileError
        if(!profile?.restaurant_id) throw new Error("Restaurant profile not found.")
        const {data:sessionData}=await supabaseCloud.auth.getSession()
        const token=sessionData?.session?.access_token
        if(!token) throw new Error("Session token unavailable.")
        const res=await fetch(`/api/reports/analytics?restaurant_id=${encodeURIComponent(profile.restaurant_id)}&days=${days}`,{headers:{Authorization:`Bearer ${token}`},cache:"no-store"})
        const payload=await res.json().catch(()=>({}))
        if(!res.ok||!payload.success) throw new Error(payload.error||"Unable to load analytics")
        if(!cancelled){setRestaurantId(profile.restaurant_id);setData(payload)}
      } catch(e){if(!cancelled){setError(e?.message||"Unable to load analytics");setData(null)}}
      finally{if(!cancelled)setLoading(false)}
    }
    load(); return ()=>{cancelled=true}
  },[days])

  const summary=data?.summary||{}
  const daily=data?.daily||[]
  const products=data?.products||[]
  const payments=data?.payments||[]
  const sources=data?.sources||[]
  const expenses=data?.expenses_by_category||[]

  const paymentTotal=useMemo(()=>payments.reduce((s,x)=>s+Number(x.amount||0),0),[payments])
  const exportCsv=()=>{
    if(!data)return
    const rows=[
      ["Metric","Value"],
      ["Orders",summary.orders],
      ["Revenue",summary.revenue],
      ["Refunds",summary.refunds],
      ["Net Revenue",summary.net_revenue],
      ["Expenses",summary.expenses],
      ["Operating Result",summary.operating_result],
      ["Discounts",summary.discounts],
      ["Taxes",summary.taxes],
      ["Average Order Value",summary.average_order_value],
      [],["Top Products","Quantity","Revenue"],
      ...products.map(x=>[x.name,x.quantity,x.revenue])
    ]
    const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n")
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"})
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`anaira-report-${days}days.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return <main style={styles.page}>
    <div style={styles.top}>
      <div><div style={styles.kicker}>ANAIRA ANALYTICS</div><h1 style={styles.h1}>Advanced Reports</h1><p style={styles.sub}>Sales, payments, products, expenses and operational performance.</p></div>
      <div style={styles.actions}><select value={days} onChange={e=>setDays(Number(e.target.value))} style={styles.select}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select><button onClick={exportCsv} style={styles.button}>Export CSV</button></div>
    </div>
    {error&&<div style={styles.error}>{error}</div>}
    {loading?<div style={styles.loading}>Loading analytics…</div>:<>
      <section className="advanced-analytics-grid-4" style={styles.grid}>
        <Kpi title="Net Revenue" value={money(summary.net_revenue)} meta={`Gross ${money(summary.revenue)} · Refunds ${money(summary.refunds)}`}/>
        <Kpi title="Operating Result" value={money(summary.operating_result)} meta={`Expenses ${money(summary.expenses)}`}/>
        <Kpi title="Orders" value={summary.orders||0} meta={`AOV ${money(summary.average_order_value)}`}/>
        <Kpi title="Discounts / Tax" value={money(summary.discounts)} meta={`Tax collected ${money(summary.taxes)}`}/>
      </section>
      <section className="advanced-analytics-grid-2" style={styles.two}>
        <Panel title="Revenue Trend"><ResponsiveContainer width="100%" height={300}><LineChart data={daily}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date"/><YAxis tickFormatter={v=>`₹${Math.round(v/1000)}k`}/><Tooltip formatter={v=>money(v)}/><Line type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={3} dot={false}/></LineChart></ResponsiveContainer></Panel>
        <Panel title="Payment Mix"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={payments} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={100} label>{payments.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip formatter={v=>money(v)}/></PieChart></ResponsiveContainer><div style={styles.legend}>{payments.map((p,i)=><span key={p.method}><i style={{background:COLORS[i%COLORS.length]}}/>{p.method}: {money(p.amount)}</span>)}</div></Panel>
      </section>
      <section className="advanced-analytics-grid-2" style={styles.two}>
        <Panel title="Top Products"><ResponsiveContainer width="100%" height={340}><BarChart data={products.slice(0,10)} layout="vertical" margin={{left:50,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis dataKey="name" type="category" width={120}/><Tooltip formatter={v=>money(v)}/><Bar dataKey="revenue" fill="#2563eb" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></Panel>
        <Panel title="Sales by Source"><ResponsiveContainer width="100%" height={340}><BarChart data={sources.slice(0,10)}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="source"/><YAxis/><Tooltip formatter={(v,n)=>n==="revenue"?money(v):v}/><Bar dataKey="orders" fill="#d97706" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Panel>
      </section>
      <section className="advanced-analytics-grid-2" style={styles.two}>
        <Panel title="Expense Categories"><ResponsiveContainer width="100%" height={300}><BarChart data={expenses.slice(0,10)}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="category"/><YAxis/><Tooltip formatter={v=>money(v)}/><Bar dataKey="amount" fill="#dc2626" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></Panel>
        <Panel title="Report Summary"><div style={styles.summaryList}><Row label="Payment captured" value={money(paymentTotal)}/><Row label="Refunds" value={money(summary.refunds)}/><Row label="Gross revenue" value={money(summary.revenue)}/><Row label="Net revenue" value={money(summary.net_revenue)}/><Row label="Operating result" value={money(summary.operating_result)} strong/><Row label="Restaurant ID" value={restaurantId}/></div></Panel>
      </section>
    </>}
  </main>
}

function Kpi({title,value,meta}){return <div style={styles.kpi}><span>{title}</span><strong>{value}</strong><small>{meta}</small></div>}
function Panel({title,children}){return <div style={styles.panel}><h2>{title}</h2>{children}</div>}
function Row({label,value,strong}){return <div style={styles.row}><span>{label}</span><strong style={strong?{color:"#0f766e"}:undefined}>{value}</strong></div>}

const styles={
 page:{minHeight:"100vh",padding:"28px clamp(14px,3vw,40px) 50px",background:"var(--background,#f6f8fb)",color:"var(--foreground,#142033)"},
 top:{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:20,marginBottom:24,flexWrap:"wrap"},
 kicker:{fontSize:12,fontWeight:800,letterSpacing:1.5,opacity:.65},h1:{margin:"6px 0",fontSize:"clamp(25px,4vw,38px)"},sub:{margin:0,opacity:.68},actions:{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"},select:{padding:"11px 14px",borderRadius:10,border:"1px solid #d7dde7",background:"white"},button:{padding:"11px 15px",border:0,borderRadius:10,background:"#0f766e",color:"white",fontWeight:700,cursor:"pointer"},error:{padding:14,borderRadius:12,background:"#fee2e2",color:"#991b1b",marginBottom:18},loading:{padding:50,textAlign:"center"},grid:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:14,marginBottom:16},kpi:{background:"white",border:"1px solid #e5eaf0",borderRadius:16,padding:18,boxShadow:"0 8px 25px rgba(20,32,51,.05)"},two:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16,marginBottom:16},panel:{background:"white",border:"1px solid #e5eaf0",borderRadius:16,padding:18,boxShadow:"0 8px 25px rgba(20,32,51,.05)",minWidth:0},legend:{display:"flex",gap:10,flexWrap:"wrap",fontSize:12},summaryList:{display:"grid",gap:0},row:{display:"flex",justifyContent:"space-between",gap:15,padding:"13px 0",borderBottom:"1px solid #edf0f4",fontSize:14}
}
