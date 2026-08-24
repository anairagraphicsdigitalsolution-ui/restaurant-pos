"use client"
import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = n => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
export default function CustomersPage(){
  const [rid,setRid]=useState(null),[customers,setCustomers]=useState([]),[search,setSearch]=useState(""),[loading,setLoading]=useState(true),[selected,setSelected]=useState(null),[orders,setOrders]=useState([]),[showAdd,setShowAdd]=useState(false),[saving,setSaving]=useState(false),[form,setForm]=useState({name:"",phone:"",email:""}),[message,setMessage]=useState("")
  async function load(){
    setLoading(true); const {data:u}=await supabase.auth.getUser(); if(!u?.user){setLoading(false);return}
    const {data:p}=await supabase.from("profiles").select("restaurant_id").eq("id",u.user.id).single(); if(!p?.restaurant_id){setLoading(false);return}
    setRid(p.restaurant_id); const {data}=await supabase.from("customers").select("*").eq("restaurant_id",p.restaurant_id).order("total_spend",{ascending:false}); setCustomers(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])

  async function addCustomer(e){
    e.preventDefault()
    if(!rid || !form.name.trim()) { setMessage("Customer name is required"); return }
    const phone=form.phone.trim()
    setSaving(true); setMessage("")
    try {
      if(phone){
        const {data:existing,error:lookupError}=await supabase.from("customers").select("id,name").eq("restaurant_id",rid).eq("phone",phone).maybeSingle()
        if(lookupError) throw lookupError
        if(existing){ setMessage(`Customer already exists: ${existing.name || phone}`); return }
      }
      const {error}=await supabase.from("customers").insert({restaurant_id:rid,name:form.name.trim(),phone:phone||null,email:form.email.trim()||null})
      if(error) throw error
      setForm({name:"",phone:"",email:""}); setShowAdd(false); setMessage("Customer added successfully"); await load()
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Unable to add customer")
    } finally { setSaving(false) }
  }

  async function open(c){setSelected(c); const {data}=await supabase.from("orders").select("id,created_at,status,total_amount,source_type").eq("restaurant_id",rid).eq("customer_id",c.id).order("created_at",{ascending:false}).limit(50); setOrders(data||[])}
  const filtered=useMemo(()=>customers.filter(c=>`${c.name||""} ${c.phone||""} ${c.email||""}`.toLowerCase().includes(search.toLowerCase())),[customers,search])
  return <div className="app-shell"><main className="page"><div className="page-head"><div><span className="eyebrow">CRM</span><h1>Customers</h1><p>Customer 360, repeat visits and lifetime value.</p></div><div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><button className="btn primary" onClick={()=>setShowAdd(true)}>＋ Add Customer</button><button className="btn" onClick={load}>↻ Refresh</button></div></div>
    <div className="stats"><div><b>{customers.length}</b><span>Total Customers</span></div><div><b>{customers.filter(c=>Number(c.total_orders)>1).length}</b><span>Returning</span></div><div><b>{money(customers.reduce((s,c)=>s+Number(c.total_spend||0),0))}</b><span>Lifetime Revenue</span></div><div><b>{customers.length?money(customers.reduce((s,c)=>s+Number(c.total_spend||0),0)/customers.length):money(0)}</b><span>Avg Customer Value</span></div></div>
    <div className="card"><input className="input" placeholder="Search name, phone or email…" value={search} onChange={e=>setSearch(e.target.value)}/><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Orders</th><th>Spent</th><th>Points</th><th>Last Visit</th><th/></tr></thead><tbody>{loading?<tr><td colSpan="6">Loading…</td></tr>:filtered.map(c=><tr key={c.id}><td><b>{c.name||"Guest"}</b><small>{c.phone||c.email||"No contact"}</small></td><td>{c.total_orders||0}</td><td>{money(c.total_spend)}</td><td>⭐ {c.loyalty_points||0}</td><td>{c.last_visit_at?new Date(c.last_visit_at).toLocaleDateString("en-IN"):"—"}</td><td><button className="ghost" onClick={()=>open(c)}>View</button></td></tr>)}</tbody></table></div></div>
    {message&&<div className="notice">{message}</div>}
    {showAdd&&<div className="modal-back" onClick={()=>setShowAdd(false)}><div className="modal add-modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowAdd(false)}>×</button><span className="eyebrow">CUSTOMER MASTER</span><h2>Add Customer</h2><p>Save a reusable customer profile for repeat orders and loyalty.</p><form onSubmit={addCustomer} className="add-form"><label>Full name *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Rahul Sharma" autoFocus /></label><label>Mobile<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="10 digit mobile" inputMode="tel" /></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="customer@email.com" /></label><div className="form-actions"><button type="button" className="btn" onClick={()=>setShowAdd(false)}>Cancel</button><button className="btn primary" disabled={saving}>{saving?"Saving…":"Save Customer"}</button></div></form></div></div>}
    {selected&&<div className="modal-back" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">CUSTOMER 360</span><h2>{selected.name}</h2><p>{selected.phone||selected.email||"No contact details"}</p><div className="stats mini"><div><b>{selected.total_orders||0}</b><span>Orders</span></div><div><b>{money(selected.total_spend)}</b><span>Spent</span></div><div><b>⭐ {selected.loyalty_points||0}</b><span>Points</span></div></div><h3>Recent Orders</h3>{orders.map(o=><div className="order-row" key={o.id}><span>#{String(o.id).slice(0,8)}</span><span>{o.status}</span><b>{money(o.total_amount)}</b></div>)}</div></div>}
  </main><style jsx global>{css}</style></div>
}
const css=`.app-shell{min-height:100vh;background:var(--background);color:var(--text)}.page{margin-left:0;padding:32px;min-height:100vh}.page-head{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:24px}.eyebrow{font-size:11px;font-weight:900;letter-spacing:.14em;color:var(--info)}.page h1{margin:5px 0;font-size:34px}.page p{color:var(--muted)}.btn,.ghost{border:1px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:12px;padding:11px 15px;font-weight:800;cursor:pointer}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.stats>div{padding:20px;border:1px solid var(--border);background:linear-gradient(145deg,var(--surface-2),var(--surface));border-radius:18px}.stats b{display:block;font-size:24px}.stats span{display:block;color:var(--muted);font-size:12px;margin-top:5px}.card,.modal{border:1px solid var(--border);background:var(--surface);border-radius:20px;padding:20px}.input{width:100%;box-sizing:border-box;padding:13px 15px;border-radius:12px;border:1px solid var(--border);background:var(--background);color:var(--text);outline:none;margin-bottom:15px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:700px}th,td{text-align:left;padding:14px;border-bottom:1px solid var(--border)}th{color:var(--muted);font-size:11px;text-transform:uppercase}td small{display:block;color:var(--muted);margin-top:3px}.modal-back{position:fixed;inset:0;background:color-mix(in srgb, var(--background) 55%, #000 45%);display:grid;place-items:center;padding:20px;z-index:100}.modal{width:min(680px,100%);max-height:85vh;overflow:auto;position:relative}.close{position:absolute;right:15px;top:12px;background:transparent;border:0;color:var(--text);font-size:26px}.mini{grid-template-columns:repeat(3,1fr)}.order-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)}@media(max-width:900px){.page{margin-left:0;padding:20px}.stats{grid-template-columns:repeat(2,1fr)}}.btn.primary{background:var(--primary);color:#111;border-color:var(--primary);font-weight:900}.notice{margin-bottom:14px;padding:12px 14px;border:1px solid var(--border);background:var(--surface-2);border-radius:12px;font-weight:800}.add-form{display:grid;gap:14px}.add-form label{display:grid;gap:7px;font-weight:800;font-size:13px}.add-form input{width:100%;box-sizing:border-box;padding:12px 13px;border-radius:11px;border:1px solid var(--border);background:var(--background);color:var(--text);outline:none}.form-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}@media(max-width:520px){.page{padding:15px}.page-head{align-items:flex-start}.page h1{font-size:28px}.stats{grid-template-columns:1fr 1fr}.mini{grid-template-columns:1fr 1fr}.page-head .btn{padding:9px 11px}}
`;
