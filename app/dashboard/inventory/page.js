"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function Inventory() {
  const [items, setItems] = useState([])
  const [name, setName] = useState("")
  const [qty, setQty] = useState("")
  const [unit, setUnit] = useState("kg")

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from("inventory")
      .select("*")
      .order("name")

    setItems(data || [])
  }

  async function addItem() {
    if (!name || !qty) return alert("Fill all fields")

    await supabase.from("inventory").insert([
      { name, quantity: parseInt(qty), unit }
    ])

    setName("")
    setQty("")
    fetchItems()
  }

  async function updateStock(id, change) {
    const item = items.find(i => i.id === id)

    await supabase
      .from("inventory")
      .update({
        quantity: Math.max(0, item.quantity + change),
      })
      .eq("id", id)

    fetchItems()
  }

  return (
    <div style={layout}>

      {/* HEADER */}
      <h1 style={title}>📦 Inventory Manager</h1>

      {/* 🔥 ADD PANEL */}
      <div style={panel}>

        <input
          placeholder="Item name"
          value={name}
          onChange={e=>setName(e.target.value)}
          style={input}
        />

        <input
          type="number"
          placeholder="Qty"
          value={qty}
          onChange={e=>setQty(e.target.value)}
          style={input}
        />

        {/* 🔥 FIXED SELECT */}
        <select
          value={unit}
          onChange={e=>setUnit(e.target.value)}
          style={select}
        >
          <option value="kg">KG</option>
          <option value="ltr">LTR</option>
          <option value="pcs">PCS</option>
        </select>

        <button onClick={addItem} style={addBtn}>
          + Add
        </button>
      </div>

      {/* GRID */}
      <div style={grid}>
        {items.map(item => (
          <div key={item.id} style={card}>

            <div style={top}>
              <h3>{item.name}</h3>

              <span style={badge(item.quantity)}>
                {item.quantity} {item.unit}
              </span>
            </div>

            <div style={line}></div>

            <div style={actions}>
              <button onClick={()=>updateStock(item.id,1)} style={btnAdd}>+</button>
              <button onClick={()=>updateStock(item.id,-1)} style={btnUse}>-</button>
            </div>

          </div>
        ))}
      </div>

    </div>
  )
}

/* 🎨 PREMIUM UI */

const layout = {
  minHeight: "100vh",
  padding: 30,
  background: "radial-gradient(circle at top,#020617,#000)",
  color: "#fff"
}

const title = {
  fontSize: 28,
  marginBottom: 20,
  color: "#22c55e"
}

/* 🔥 PANEL */
const panel = {
  display: "flex",
  gap: 10,
  padding: 15,
  borderRadius: 15,
  marginBottom: 30,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(15px)",
  border: "1px solid rgba(255,255,255,0.08)"
}

const input = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff"
}

/* 🔥 FIXED SELECT */
const select = {
  padding: 10,
  borderRadius: 10,
  background: "#020617",   // 🔥 IMPORTANT FIX
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  outline: "none",
  cursor: "pointer"
}

const addBtn = {
  padding: "10px 18px",
  borderRadius: 10,
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  border: "none",
  color: "#fff"
}

/* 🔥 GRID */
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))",
  gap: 20
}

const card = {
  padding: 18,
  borderRadius: 18,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)"
}

const top = {
  display: "flex",
  justifyContent: "space-between"
}

const badge = (q) => ({
  padding: "5px 10px",
  borderRadius: 20,
  background: q < 5 ? "#ef4444" : "#22c55e"
})

const line = {
  height: 1,
  background: "rgba(255,255,255,0.08)",
  margin: "10px 0"
}

const actions = {
  display: "flex",
  gap: 10
}

const btnAdd = {
  flex: 1,
  padding: 8,
  background: "#22c55e",
  border: "none",
  borderRadius: 8,
  color: "#fff"
}

const btnUse = {
  flex: 1,
  padding: 8,
  background: "#ef4444",
  border: "none",
  borderRadius: 8,
  color: "#fff"
}