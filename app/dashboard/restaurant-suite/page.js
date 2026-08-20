"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`

export default function RestaurantSuite() {
  const [rid, setRid] = useState(null)
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState([])
  const [tokens, setTokens] = useState([])
  const [channels, setChannels] = useState([])
  const [recon, setRecon] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [captains, setCaptains] = useState([])
  const [foodCosts, setFoodCosts] = useState([])
  const [items, setItems] = useState([])
  const [message, setMessage] = useState("")

  const [channelForm, setChannelForm] = useState({ channel_code: "swiggy", channel_name: "Swiggy", active: false })
  const [reconForm, setReconForm] = useState({ channel_code: "swiggy", external_order_id: "", gross_amount: "", commission: "", platform_charges: "", payout_amount: "", order_date: "" })
  const [campaignForm, setCampaignForm] = useState({ name: "", channel: "whatsapp", message: "" })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: user } = await supabase.auth.getUser()
    if (!user?.user) { setLoading(false); return }

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id,role")
      .eq("id", user.user.id)
      .maybeSingle()

    if (!profile?.restaurant_id) { setLoading(false); return }
    setRid(profile.restaurant_id)
    await load(profile.restaurant_id)
  }

  async function load(restaurantId = rid) {
    if (!restaurantId) return
    setLoading(true)

    const today = new Date().toISOString().slice(0, 10)

    const [
      ordersRes,
      tokenRes,
      channelRes,
      reconRes,
      campaignRes,
      captainRes,
      itemsRes
    ] = await Promise.all([
      supabase.from("orders").select("id,source_label,order_mode,status,total_amount,payment_status,created_at").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(100),
      supabase.from("order_tokens").select("*").eq("restaurant_id", restaurantId).eq("token_date", today).order("token_no"),
      supabase.from("online_channels").select("*").eq("restaurant_id", restaurantId).order("channel_name"),
      supabase.from("online_order_reconciliations").select("*").eq("restaurant_id", restaurantId).order("order_date", { ascending: false }).limit(100),
      supabase.from("marketing_campaigns").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(50),
      supabase.from("captain_sessions").select("*").eq("restaurant_id", restaurantId).order("last_seen_at", { ascending: false }),
      supabase.from("menu_items").select("id,name,price").eq("restaurant_id", restaurantId).order("name")
    ])

    setOrders(ordersRes.data || [])
    setTokens(tokenRes.data || [])
    setChannels(channelRes.data || [])
    setRecon(reconRes.data || [])
    setCampaigns(campaignRes.data || [])
    setCaptains(captainRes.data || [])
    setItems(itemsRes.data || [])
    setLoading(false)
  }

  async function updateToken(id, status) {
    const patch = { status }
    if (status === "ready") patch.ready_at = new Date().toISOString()
    if (status === "picked_up") patch.picked_up_at = new Date().toISOString()

    const { error } = await supabase.from("order_tokens").update(patch).eq("id", id).eq("restaurant_id", rid)
    if (error) return setMessage(error.message)
    setMessage("Token updated")
    await load()
  }

  async function saveChannel(e) {
    e.preventDefault()
    const { error } = await supabase.from("online_channels").upsert({
      restaurant_id: rid,
      ...channelForm,
      updated_at: new Date().toISOString()
    }, { onConflict: "restaurant_id,channel_code" })
    if (error) return setMessage(error.message)
    setMessage("Online channel saved")
    await load()
  }

  async function saveRecon(e) {
    e.preventDefault()
    const gross = Number(reconForm.gross_amount || 0)
    const commission = Number(reconForm.commission || 0)
    const charges = Number(reconForm.platform_charges || 0)
    const payout = reconForm.payout_amount === "" ? gross - commission - charges : Number(reconForm.payout_amount || 0)

    const { error } = await supabase.from("online_order_reconciliations").insert({
      restaurant_id: rid,
      channel_code: reconForm.channel_code,
      external_order_id: reconForm.external_order_id || null,
      gross_amount: gross,
      commission,
      platform_charges: charges,
      payout_amount: payout,
      order_date: reconForm.order_date || new Date().toISOString().slice(0, 10),
      settlement_status: "pending"
    })

    if (error) return setMessage(error.message)
    setMessage("Reconciliation row added")
    setReconForm({ channel_code: reconForm.channel_code, external_order_id: "", gross_amount: "", commission: "", platform_charges: "", payout_amount: "", order_date: "" })
    await load()
  }

  async function saveCampaign(e) {
    e.preventDefault()
    if (!campaignForm.name.trim() || !campaignForm.message.trim()) return setMessage("Campaign name and message are required")

    const { data: user } = await supabase.auth.getUser()
    const { error } = await supabase.from("marketing_campaigns").insert({
      restaurant_id: rid,
      name: campaignForm.name.trim(),
      channel: campaignForm.channel,
      message: campaignForm.message.trim(),
      created_by: user?.user?.id || null,
      status: "draft"
    })
    if (error) return setMessage(error.message)
    setCampaignForm({ name: "", channel: "whatsapp", message: "" })
    setMessage("Campaign draft saved")
    await load()
  }

  async function calculateCost(itemId) {
    const { data, error } = await supabase.rpc("calculate_food_cost", {
      p_restaurant_id: rid,
      p_menu_item_id: itemId
    })
    if (error) return setMessage(error.message)

    const row = {
      restaurant_id: rid,
      menu_item_id: itemId,
      recipe_cost: Number(data?.recipe_cost || 0),
      selling_price: Number(data?.selling_price || 0),
      food_cost_percent: Number(data?.food_cost_percent || 0),
      margin: Number(data?.margin || 0)
    }

    const { error: saveError } = await supabase.from("food_cost_snapshots").insert(row)
    if (saveError) return setMessage(saveError.message)

    setFoodCosts(prev => [row, ...prev])
    setMessage(`Food cost calculated: ${money(row.recipe_cost)}`)
  }

  const stats = useMemo(() => {
    const active = orders.filter(o => !["cancelled","canceled","void","refunded"].includes(String(o.status || "").toLowerCase()))
    return {
      sales: active.reduce((s, o) => s + Number(o.total_amount || 0), 0),
      orders: active.length,
      takeaway: active.filter(o => o.order_mode === "takeaway").length,
      delivery: active.filter(o => o.order_mode === "delivery").length,
      ready: tokens.filter(t => t.status === "ready").length,
      pendingSettlement: recon.filter(r => r.settlement_status === "pending").length
    }
  }, [orders, tokens, recon])

  return (
    <main className="suite">
      <section className="hero">
        <div>
          <div className="eyebrow">ANAIRA RESTAURANT SUITE</div>
          <h1>Complete Operations Center</h1>
          <p>Dine-in, takeaway, delivery, tokens, riders, online channels, inventory costing, CRM campaigns, staff operations and reconciliation in one place.</p>
        </div>
        <button onClick={() => load()} className="refresh">↻ Refresh</button>
      </section>

      <nav className="tabs">
        {[
          ["overview","Overview"],
          ["tokens","Token / Pickup"],
          ["online","Online Orders"],
          ["costing","Food Cost"],
          ["marketing","CRM Campaigns"],
          ["captain","Captain / Staff"],
          ["devices","Kiosk / Display"]
        ].map(([id,label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {message && <div className="message">{message}</div>}

      {tab === "overview" && (
        <>
          <section className="stats">
            <Stat label="Sales" value={money(stats.sales)} />
            <Stat label="Orders" value={stats.orders} />
            <Stat label="Takeaway" value={stats.takeaway} />
            <Stat label="Delivery" value={stats.delivery} />
            <Stat label="Ready Tokens" value={stats.ready} />
            <Stat label="Online Pending" value={stats.pendingSettlement} />
          </section>

          <section className="grid">
            <Panel title="Operational chain">
              <div className="flow">
                {["Order","KOT","Preparing","Ready","Dine-in / Takeaway / Delivery","Payment","Settlement","Inventory","CRM / Loyalty","Reports"].map((x,i) => <span key={x}>{i+1}. {x}</span>)}
              </div>
            </Panel>

            <Panel title="What is now covered">
              <ul className="checks">
                <li>✓ Dine-in / Takeaway / Delivery order modes</li>
                <li>✓ Delivery slip + rider settlement</li>
                <li>✓ Takeaway tokens + pickup status</li>
                <li>✓ Recipe-based stock deduction trigger</li>
                <li>✓ Food-cost calculation</li>
                <li>✓ Online channel + payout reconciliation records</li>
                <li>✓ CRM campaign drafts</li>
                <li>✓ Captain sessions / device foundation</li>
              </ul>
            </Panel>
          </section>
        </>
      )}

      {tab === "tokens" && (
        <Panel title="Today's Token Board">
          <div className="tokenGrid">
            {tokens.length ? tokens.map(t => (
              <div className={`token ${t.status}`} key={t.id}>
                <div className="tokenNo">#{t.token_no}</div>
                <b>{String(t.token_type || "").toUpperCase()}</b>
                <small>{t.pickup_name || "Walk-in"}</small>
                <strong>{t.status.replaceAll("_"," ")}</strong>
                <div className="actions">
                  <button onClick={() => updateToken(t.id, "ready")}>READY</button>
                  <button onClick={() => updateToken(t.id, "picked_up")}>PICKED UP</button>
                </div>
              </div>
            )) : <Empty text="No takeaway/delivery tokens today." />}
          </div>
        </Panel>
      )}

      {tab === "online" && (
        <section className="grid">
          <Panel title="Online Channels">
            <form onSubmit={saveChannel} className="form">
              <input value={channelForm.channel_name} onChange={e => setChannelForm({...channelForm,channel_name:e.target.value})} placeholder="Channel name" />
              <select value={channelForm.channel_code} onChange={e => setChannelForm({...channelForm,channel_code:e.target.value})}>
                <option value="swiggy">Swiggy</option>
                <option value="zomato">Zomato</option>
                <option value="website">Website</option>
                <option value="qr">QR</option>
                <option value="other">Other</option>
              </select>
              <label><input type="checkbox" checked={channelForm.active} onChange={e => setChannelForm({...channelForm,active:e.target.checked})} /> Active</label>
              <button>Save Channel</button>
            </form>
            {channels.map(c => <div className="row" key={c.id}><b>{c.channel_name}</b><span>{c.active ? "ACTIVE" : "OFF"}</span></div>)}
          </Panel>

          <Panel title="Payout Reconciliation">
            <form onSubmit={saveRecon} className="form">
              <select value={reconForm.channel_code} onChange={e => setReconForm({...reconForm,channel_code:e.target.value})}><option>swiggy</option><option>zomato</option><option>website</option><option>other</option></select>
              <input value={reconForm.external_order_id} onChange={e => setReconForm({...reconForm,external_order_id:e.target.value})} placeholder="External order ID" />
              <input type="number" value={reconForm.gross_amount} onChange={e => setReconForm({...reconForm,gross_amount:e.target.value})} placeholder="Gross" />
              <input type="number" value={reconForm.commission} onChange={e => setReconForm({...reconForm,commission:e.target.value})} placeholder="Commission" />
              <input type="number" value={reconForm.platform_charges} onChange={e => setReconForm({...reconForm,platform_charges:e.target.value})} placeholder="Platform charges" />
              <button>Add reconciliation</button>
            </form>
            {recon.slice(0,10).map(r => <div className="row" key={r.id}><b>{r.channel_code} • {r.external_order_id || "—"}</b><span>{money(r.payout_amount)}</span></div>)}
          </Panel>
        </section>
      )}

      {tab === "costing" && (
        <Panel title="Recipe / Food Cost">
          <p className="muted">Calculates ingredient cost from the existing Recipe/BOM and Inventory cost price, then stores a snapshot for reporting.</p>
          <div className="itemGrid">
            {items.map(item => <div className="item" key={item.id}><div><b>{item.name}</b><small>Selling {money(item.price)}</small></div><button onClick={() => calculateCost(item.id)}>Calculate</button></div>)}
          </div>
          {foodCosts.length > 0 && <div className="costTable">{foodCosts.slice(0,20).map((x,i)=><div className="row" key={i}><b>{items.find(it=>it.id===x.menu_item_id)?.name || x.menu_item_id}</b><span>Cost {money(x.recipe_cost)} • {x.food_cost_percent}% • Margin {money(x.margin)}</span></div>)}</div>}
        </Panel>
      )}

      {tab === "marketing" && (
        <Panel title="CRM / Marketing Campaigns">
          <form onSubmit={saveCampaign} className="form">
            <input value={campaignForm.name} onChange={e => setCampaignForm({...campaignForm,name:e.target.value})} placeholder="Campaign name" />
            <select value={campaignForm.channel} onChange={e => setCampaignForm({...campaignForm,channel:e.target.value})}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="email">Email</option></select>
            <textarea value={campaignForm.message} onChange={e => setCampaignForm({...campaignForm,message:e.target.value})} placeholder="Message" rows={4} />
            <button>Save campaign draft</button>
          </form>
          {campaigns.map(c => <div className="row" key={c.id}><b>{c.name}</b><span>{c.channel} • {c.status}</span></div>)}
        </Panel>
      )}

      {tab === "captain" && (
        <Panel title="Captain / Staff Devices">
          <p className="muted">The Captain foundation records active staff devices and last-seen time. Connect the waiter mobile UI to this table for live table-order/KOT workflow.</p>
          {captains.length ? captains.map(c => <div className="row" key={c.id}><b>{c.staff_name || "Staff"}</b><span>{c.device_name || "Device"} • {new Date(c.last_seen_at).toLocaleString("en-IN")}</span></div>) : <Empty text="No captain devices registered yet." />}
        </Panel>
      )}

      {tab === "devices" && (
        <section className="grid">
          <Panel title="Self-Service Kiosk">
            <p className="muted">Kiosk records are available for the self-service order UI. Existing POS/menu data remains untouched.</p>
            <a className="link" href="/order">Open customer ordering →</a>
          </Panel>
          <Panel title="Digital Display / Calling">
            <p className="muted">Display playlists and calling-device records are stored independently so they can be connected to TV/kitchen hardware without touching existing orders.</p>
            <a className="link" href="/kitchen">Open KDS →</a>
          </Panel>
        </section>
      )}

      {loading && <div className="loading">Loading…</div>}

      <style jsx>{`
        .suite{min-height:100vh;padding:24px;background:linear-gradient(135deg,var(--background),var(--surface-2),var(--background));color:#fff}
        .hero,.panel,.stats>div{background:rgba(var(--surface-2-rgb),.85);border:1px solid rgba(var(--primary-rgb),.16);border-radius:22px;box-shadow:0 18px 50px rgba(0,0,0,.24);backdrop-filter:blur(18px)}
        .hero{padding:28px;display:flex;justify-content:space-between;gap:20px;align-items:center}
        .eyebrow{color:var(--primary);font-size:11px;font-weight:900;letter-spacing:1.6px}
        h1{margin:6px 0 8px;font-size:clamp(30px,4vw,46px)}p{color:var(--muted);line-height:1.6}
        .refresh,.tabs button,.form button,.item button,.actions button{border:1px solid rgba(var(--primary-rgb),.2);background:rgba(var(--primary-rgb),.09);color:#fff;border-radius:11px;padding:10px 13px;font-weight:800;cursor:pointer}
        .tabs{display:flex;gap:8px;overflow:auto;padding:14px 0}.tabs button{white-space:nowrap}.tabs button.active{background:var(--primary);color:#07110d}
        .message{padding:12px 15px;background:rgba(var(--primary-rgb),.1);border:1px solid rgba(var(--primary-rgb),.2);border-radius:12px;margin-bottom:14px;color:var(--primary)}
        .stats{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px}.stats>div{padding:18px}.stats small{color:var(--muted)}.stats strong{display:block;font-size:25px;margin-top:6px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}.panel{padding:20px}.panel h2{margin:0 0 12px;font-size:18px}.muted{color:var(--muted);font-size:13px}
        .flow{display:flex;flex-wrap:wrap;gap:9px}.flow span{padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);font-size:12px}
        .checks{list-style:none;padding:0;margin:0;display:grid;gap:10px}.checks li{color:#dbeafe;font-size:13px}
        .tokenGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}.token{padding:15px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07)}.tokenNo{font-size:32px;font-weight:900;color:var(--primary)}.token small,.token strong{display:block;margin-top:5px}.token strong{text-transform:capitalize;color:#fbbf24}.token.ready strong{color:#4ade80}.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.actions button{font-size:10px;padding:7px}
        .form{display:grid;gap:9px;margin-bottom:14px}.form input,.form select,.form textarea{width:100%;box-sizing:border-box;background:#0f172a;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:11px}.form label{font-size:12px;color:var(--muted)}
        .row{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px}.row span{color:var(--muted)}
        .itemGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:12px;border-radius:12px;background:rgba(255,255,255,.03)}.item small{display:block;color:var(--muted);margin-top:3px}
        .link{color:var(--primary);font-weight:800;text-decoration:none}.loading,.empty{padding:25px;text-align:center;color:var(--muted)}
        @media(max-width:1100px){.stats{grid-template-columns:repeat(3,1fr)}.tokenGrid{grid-template-columns:repeat(3,1fr)}.itemGrid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:760px){.suite{padding:14px}.hero{padding:20px;display:block}.refresh{margin-top:12px}.grid{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}.tokenGrid{grid-template-columns:repeat(2,1fr)}.itemGrid{grid-template-columns:1fr}}
      `}</style>
    </main>
  )
}

function Panel({ title, children }) {
  return <section className="panel"><h2>{title}</h2>{children}</section>
}
function Stat({ label, value }) {
  return <div><small>{label}</small><strong>{value}</strong></div>
}
function Empty({ text }) {
  return <div className="empty">{text}</div>
}
