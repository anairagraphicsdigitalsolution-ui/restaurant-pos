"use client"

import { useEffect, useMemo, useState } from "react"
import { supabaseCloud } from "@/lib/supabaseCloud"

const emptyForm = { name: "", price: "", category: "Combo Meals", image: "", mode: "fixed", groupName: "Choose your meal", min: 1, max: 1 }

export default function CombosPage() {
  const [rid, setRid] = useState(null)
  const [items, setItems] = useState([])
  const [combos, setCombos] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [selectedItems, setSelectedItems] = useState({})
  const [selectedOptions, setSelectedOptions] = useState([])
  const [optionDeltas, setOptionDeltas] = useState({})
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState("")
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState("")
  const [comboAccess, setComboAccess] = useState(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data: user } = await supabaseCloud.auth.getUser()
    const { data: profile } = await supabaseCloud.from("profiles").select("restaurant_id").eq("id", user?.user?.id).maybeSingle()
    const restaurantId = profile?.restaurant_id
    if (!restaurantId) return setMessage("Restaurant profile not found.")
    setRid(restaurantId)
    const [{data:plugin},{data:settings}] = await Promise.all([
      supabaseCloud.from("restaurant_plugins").select("enabled").eq("restaurant_id",restaurantId).eq("plugin_code","offers").maybeSingle(),
      supabaseCloud.from("plugin_settings").select("config").eq("restaurant_id",restaurantId).eq("plugin_code","offers").maybeSingle()
    ])
    const allowed = plugin?.enabled === true && settings?.config?.combos_enabled !== false
    setComboAccess(allowed)
    if (!allowed) return setMessage("Combos are disabled by Super Admin in Offers & Combos.")
    await load(restaurantId)
  }

  async function load(restaurantId = rid) {
    if (!restaurantId) return
    const [{ data: menu }, { data: comboRows }] = await Promise.all([
      supabaseCloud.from("menu_items").select("id,name,price,category,image,item_type").eq("restaurant_id", restaurantId).order("category").order("name"),
      supabaseCloud.from("menu_items").select("id,name,price,category,image,item_type,combo_config").eq("restaurant_id", restaurantId).eq("item_type", "combo").order("name")
    ])
    setItems((menu || []).filter(i => i.item_type !== "combo"))
    setCombos(comboRows || [])
  }

  const filteredItems = useMemo(() => items.filter(i => `${i.name} ${i.category || ""}`.toLowerCase().includes(search.toLowerCase())), [items, search])

  function toggleFixed(id) {
    setSelectedItems(prev => ({ ...prev, [id]: prev[id] ? undefined : 1 }))
  }

  function editCombo(combo) {
    const cfg = combo.combo_config || {}
    setEditingId(combo.id)
    setForm({ ...emptyForm, name: combo.name || "", price: combo.price || "", category: combo.category || "Combo Meals", image: combo.image || "", mode: cfg.mode || "fixed", groupName: cfg.groups?.[0]?.name || emptyForm.groupName, min: cfg.groups?.[0]?.min ?? 1, max: cfg.groups?.[0]?.max ?? 1 })
    const fixed = {}
    ;(cfg.items || []).forEach(row => { fixed[row.item_id] = row.quantity || 1 })
    setSelectedItems(fixed)
    const choiceOptions = cfg.groups?.[0]?.options || []
    setSelectedOptions(choiceOptions.map(o => o.item_id))
    setOptionDeltas(Object.fromEntries(choiceOptions.map(o => [o.item_id, Number(o.price_delta || 0)])))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function reset() {
    setEditingId(""); setForm(emptyForm); setSelectedItems({}); setSelectedOptions([]); setOptionDeltas({}); setMessage("")
  }

  async function save() {
    if (!rid || !form.name.trim() || !Number(form.price)) return setMessage("Enter combo name and price.")
    if (form.mode === "fixed" && !Object.keys(selectedItems).length) return setMessage("Select at least one item for the combo.")
    if (form.mode === "choice" && selectedOptions.length < 1) return setMessage("Select at least one option for the choice group.")
    if (form.mode === "choice" && Number(form.max || 1) < Number(form.min || 1)) return setMessage("Max selection cannot be less than Min selection.")
    if (form.mode === "choice" && Number(form.max || 1) > selectedOptions.length) return setMessage("Max selection cannot exceed available options.")
    setSaving(true); setMessage("")
    const comboConfig = form.mode === "fixed"
      ? { mode: "fixed", items: Object.entries(selectedItems).filter(([, qty]) => qty).map(([item_id, quantity]) => ({ item_id, quantity: Number(quantity) })) }
      : { mode: "choice", groups: [{ name: form.groupName.trim() || "Choose an option", min: Number(form.min || 1), max: Number(form.max || 1), options: selectedOptions.map(item_id => ({ item_id, price_delta: Number(optionDeltas[item_id] || 0) })) }] }
    const payload = { restaurant_id: rid, name: form.name.trim(), price: Number(form.price), category: form.category.trim() || "Combo Meals", image: form.image.trim() || null, description: "Premium combo meal", item_type: "combo", combo_config: comboConfig }
    const result = editingId
      ? await supabaseCloud.from("menu_items").update(payload).eq("id", editingId).eq("restaurant_id", rid)
      : await supabaseCloud.from("menu_items").insert(payload)
    if (result.error) setMessage(result.error.message)
    else { setMessage(editingId ? "Combo updated successfully." : "Combo created successfully."); reset(); await load() }
    setSaving(false)
  }

  async function remove(id) {
    if (!window.confirm("Delete this combo?")) return
    const { error } = await supabaseCloud.from("menu_items").delete().eq("id", id).eq("restaurant_id", rid)
    if (error) setMessage(error.message); else await load()
  }

  if (comboAccess === false) return <main className="combo-page"><section className="hero"><div><div className="eyebrow">OFFERS & COMBOS</div><h1>🍱 Combos disabled</h1><p>Super Admin has disabled Combos for this restaurant.</p></div></section></main>

  return <main className="combo-page">
    <section className="hero">
      <div><div className="eyebrow">ANAIRA POS • MENU BUILDER</div><h1>🍱 Combo Meals</h1><p>Create fixed or selectable meal bundles that appear directly in the QR Menu.</p><div className="hero-note">Combo price is controlled by the combo itself; component items remain linked for kitchen display.</div></div>
      <div className="hero-stat"><span>Live combos</span><strong>{combos.length}</strong><small>Available in QR menu</small></div>
    </section>

    {message && <div className="message">{message}</div>}

    <section className="builder">
      <div className="section-head"><div><div className="eyebrow">CREATE / EDIT</div><h2>{editingId ? "Edit Combo" : "Create Combo"}</h2></div>{editingId && <button className="ghost" onClick={reset}>Cancel</button>}</div>
      <div className="fields">
        <input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Combo name" />
        <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({...form,price:e.target.value})} placeholder="Combo price" />
        <input value={form.category} onChange={e => setForm({...form,category:e.target.value})} placeholder="Category" />
        <input value={form.image} onChange={e => setForm({...form,image:e.target.value})} placeholder="Image URL (optional)" />
      </div>
      <div className="mode-tabs"><button className={form.mode === "fixed" ? "active" : ""} onClick={() => setForm({...form,mode:"fixed"})}>Fixed Combo</button><button className={form.mode === "choice" ? "active" : ""} onClick={() => setForm({...form,mode:"choice"})}>Customer Choice</button></div>
      <div className="search-row"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items…" /></div>
      {form.mode === "fixed" ? <div className="item-grid">{filteredItems.map(item => <button type="button" className={`item-pick ${selectedItems[item.id] ? "selected" : ""}`} key={item.id} onClick={() => toggleFixed(item.id)}><span>{selectedItems[item.id] ? "✓" : "＋"}</span><div><b>{item.name}</b><small>{item.category || "Other"} · ₹{item.price}</small></div></button>)}</div> : <div className="choice-box"><div className="choice-fields"><input value={form.groupName} onChange={e => setForm({...form,groupName:e.target.value})} placeholder="Choice group name" /><input type="number" min="1" value={form.min} onChange={e => setForm({...form,min:e.target.value})} placeholder="Min" /><input type="number" min="1" value={form.max} onChange={e => setForm({...form,max:e.target.value})} placeholder="Max" /></div><div className="item-grid">{filteredItems.map(item => { const chosen=selectedOptions.includes(item.id); return <div className={`item-pick ${chosen ? "selected" : ""}`} key={item.id}><button type="button" className="item-pick-main" onClick={() => setSelectedOptions(prev => prev.includes(item.id) ? prev.filter(id => id !== item.id) : [...prev, item.id])}><span>{chosen ? "✓" : "＋"}</span><div><b>{item.name}</b><small>{item.category || "Other"} · ₹{item.price}</small></div></button>{chosen && <label className="delta-field">Extra ₹<input type="number" step="0.01" value={optionDeltas[item.id] ?? 0} onChange={e => setOptionDeltas(prev => ({...prev,[item.id]:e.target.value}))} /></label>}</div>})}</div></div>}
      <button className="save" disabled={saving} onClick={save}>{saving ? "Saving…" : editingId ? "Save Combo" : "Create Combo"}</button>
    </section>

    <section className="list"><div className="section-head"><div><div className="eyebrow">COMBO CATALOG</div><h2>Your Combo Meals</h2></div></div><div className="combo-grid">{combos.map(combo => { const cfg = combo.combo_config || {}; const ids = cfg.mode === "fixed" ? (cfg.items || []).map(x=>x.item_id) : (cfg.groups?.[0]?.options || []).map(x=>x.item_id); const names = ids.map(id => items.find(i=>i.id===id)?.name).filter(Boolean); return <article className="combo-card" key={combo.id}>{combo.image ? <img src={combo.image} alt="" /> : <div className="combo-image">🍱</div>}<div className="combo-body"><div className="pill">{cfg.mode === "choice" ? "CUSTOM CHOICE" : "FIXED COMBO"}</div><h3>{combo.name}</h3><strong>₹{Number(combo.price || 0).toLocaleString("en-IN")}</strong><p>{names.length ? names.join(" · ") : "No components configured"}</p><div className="card-actions"><button onClick={() => editCombo(combo)}>Edit</button><button onClick={() => remove(combo.id)}>Delete</button></div></div></article>})}</div>{!combos.length && <div className="empty">No combos yet. Create your first combo above.</div>}</section>
    <style jsx>{css}</style>
  </main>
}

const css=`
.combo-page{min-height:100vh;padding:clamp(16px,3vw,34px);background:radial-gradient(circle at 90% 0%,rgba(var(--primary-rgb),.14),transparent 30%),var(--background);color:var(--text)}.hero{display:flex;justify-content:space-between;gap:24px;align-items:center;flex-wrap:wrap;padding:clamp(22px,4vw,40px);border-radius:30px;background:linear-gradient(135deg,rgba(var(--primary-rgb),.12),rgba(255,255,255,.025));border:1px solid rgba(var(--primary-rgb),.2);box-shadow:0 30px 80px rgba(0,0,0,.22)}.eyebrow{font-size:11px;letter-spacing:2px;color:var(--primary);font-weight:900}.hero h1{margin:8px 0;font-size:clamp(30px,5vw,52px)}.hero p{margin:0;color:var(--muted);line-height:1.7}.hero-note{display:inline-flex;margin-top:15px;padding:8px 12px;border-radius:999px;background:rgba(var(--primary-rgb),.07);color:var(--primary);font-size:11px}.hero-stat{min-width:170px;padding:22px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:grid;gap:4px}.hero-stat span,.hero-stat small{color:var(--muted)}.hero-stat strong{font-size:38px;color:var(--primary)}.message{margin-top:14px;padding:12px 14px;border-radius:14px;background:rgba(var(--primary-rgb),.08);border:1px solid rgba(var(--primary-rgb),.2)}.builder,.list{margin-top:16px;padding:clamp(18px,3vw,28px);border-radius:26px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.07)}.section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px}.section-head h2{margin:5px 0 0}.fields{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.fields input,.search-row input,.choice-fields input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid rgba(var(--primary-rgb),.14);background:var(--surface);color:var(--text);outline:none}.mode-tabs{display:flex;gap:8px;margin:14px 0}.mode-tabs button,.ghost,.card-actions button{padding:10px 13px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:var(--text);cursor:pointer;font-weight:800}.mode-tabs .active{background:rgba(var(--primary-rgb),.12);border-color:rgba(var(--primary-rgb),.3);color:var(--primary)}.search-row{margin-bottom:12px}.item-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;max-height:340px;overflow:auto;padding-right:3px}.item-pick{display:flex;align-items:center;gap:10px;text-align:left;padding:8px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.025);color:var(--text);cursor:pointer}.item-pick-main{display:flex;align-items:center;gap:10px;flex:1;border:0;background:none;color:inherit;text-align:left;cursor:pointer;padding:4px}.item-pick-main>span{width:26px;height:26px;display:grid;place-items:center;border-radius:9px;background:rgba(255,255,255,.05);color:var(--muted)}.item-pick.selected{border-color:rgba(var(--primary-rgb),.35);background:rgba(var(--primary-rgb),.08)}.item-pick.selected .item-pick-main>span{color:var(--primary);background:rgba(var(--primary-rgb),.12)}.item-pick b,.item-pick small{display:block}.delta-field{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)}.delta-field input{width:76px;padding:6px;border-radius:8px;border:1px solid rgba(var(--primary-rgb),.16);background:var(--surface);color:var(--text)}.item-pick small{margin-top:3px;color:var(--muted);font-size:11px}.choice-box{display:grid;gap:12px}.choice-fields{display:grid;grid-template-columns:1fr 100px 100px;gap:10px}.save{margin-top:16px;width:100%;padding:14px;border:0;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--accent));color:#08110b;font-weight:900;cursor:pointer}.save:disabled{opacity:.55}.combo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.combo-card{overflow:hidden;border-radius:22px;background:var(--surface);border:1px solid rgba(var(--primary-rgb),.1)}.combo-card>img,.combo-image{width:100%;height:170px;object-fit:cover}.combo-image{display:grid;place-items:center;font-size:60px;background:linear-gradient(135deg,rgba(var(--primary-rgb),.08),rgba(255,255,255,.03))}.combo-body{padding:17px}.pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(var(--primary-rgb),.08);color:var(--primary);font-size:9px;font-weight:900;letter-spacing:1px}.combo-body h3{margin:9px 0 5px}.combo-body>strong{color:var(--primary);font-size:23px}.combo-body p{color:var(--muted);font-size:12px;line-height:1.6;min-height:38px}.card-actions{display:flex;gap:8px}.card-actions button:first-child{color:var(--primary)}.card-actions button:last-child{color:var(--danger)}.empty{text-align:center;padding:30px;color:var(--muted)}
@media(max-width:950px){.fields{grid-template-columns:1fr 1fr}}@media(max-width:600px){.combo-page{padding:12px}.fields,.choice-fields{grid-template-columns:1fr}.mode-tabs button{flex:1}.hero-stat{width:100%}}
`
