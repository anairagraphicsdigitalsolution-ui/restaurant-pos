"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function OffersPage() {
  const [offers, setOffers] = useState([])
  const [form, setForm] = useState({
    title: "",
    discount: "",
    description: "",
    valid_till: ""
  })
  const [editId, setEditId] = useState(null)

  useEffect(() => { fetchOffers() }, [])

  async function fetchOffers() {
    const { data } = await supabase
      .from("offers")
      .select("*")
      .order("created_at", { ascending: false })

    setOffers(data || [])
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function saveOffer() {
    if (!form.title || !form.discount) {
      alert("Fill required fields")
      return
    }

    if (editId) {
      await supabase.from("offers").update(form).eq("id", editId)
      setEditId(null)
    } else {
      await supabase.from("offers").insert([form])
    }

    setForm({ title: "", discount: "", description: "", valid_till: "" })
    fetchOffers()
  }

  function editOffer(o) {
    setForm(o)
    setEditId(o.id)
  }

  async function deleteOffer(id) {
    await supabase.from("offers").delete().eq("id", id)
    fetchOffers()
  }

  return (
    <div style={layout}>

      <h1 style={title}>🎁 Offers Management</h1>

      {/* 🔥 FORM */}
      <div style={formBox}>

        <input name="title" placeholder="Offer Title" value={form.title} onChange={handleChange} style={input}/>
        <input name="discount" placeholder="Discount %" value={form.discount} onChange={handleChange} style={input}/>
        <input name="description" placeholder="Description" value={form.description} onChange={handleChange} style={input}/>
        <input type="date" name="valid_till" value={form.valid_till} onChange={handleChange} style={input}/>

        <button onClick={saveOffer} style={saveBtn}>
          {editId ? "Update" : "Add Offer"}
        </button>

      </div>

      {/* 🔥 CARDS */}
      <div style={grid}>
        {offers.map(o => (
          <div key={o.id} style={card}>

            {/* 🔥 GLOW BADGE */}
            <div style={badge}>
              {o.discount}% OFF
            </div>

            <h2 style={cardTitle}>{o.title}</h2>
            <p style={desc}>{o.description}</p>

            <p style={date}>Valid till: {o.valid_till || "N/A"}</p>

            <div style={actions}>
              <button onClick={() => editOffer(o)} style={editBtn}>
                Edit
              </button>
              <button onClick={() => deleteOffer(o.id)} style={deleteBtn}>
                Delete
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  )
}

/* 🎨 ULTRA PREMIUM UI */

const layout = {
  minHeight: "100vh",
  padding: 30,
  background: "radial-gradient(circle at top,#020617,#000)",
  color: "#fff"
}

const title = {
  fontSize: 28,
  marginBottom: 25,
  background: "linear-gradient(90deg,#22c55e,#3b82f6)",
  WebkitBackgroundClip: "text",
  color: "transparent"
}

/* 🔥 FORM */
const formBox = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 30,
  padding: 15,
  borderRadius: 15,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(15px)",
  border: "1px solid rgba(255,255,255,0.08)"
}

const input = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff",
  outline: "none"
}

const saveBtn = {
  padding: "10px 18px",
  borderRadius: 10,
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  border: "none",
  color: "#ffffff",
  fontWeight: "600",
  boxShadow: "0 0 20px rgba(67, 61, 56, 0.4)"
}

/* 🔥 GRID */
const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
  gap: 20
}

/* 🔥 CARD */
const card = {
  position: "relative",
  padding: 20,
  borderRadius: 20,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(20px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 0 25px rgba(0,0,0,0.6)",
  transition: "0.3s"
}

const cardTitle = {
  marginTop: 10,
  fontSize: 18
}

const desc = {
  fontSize: 13,
  color: "#94a3b8",
  marginTop: 5
}

const date = {
  marginTop: 10,
  fontSize: 12,
  color: "#cbd5f5"
}

/* 🔥 GLOW BADGE */
const badge = {
  position: "absolute",
  top: 10,
  right: 10,
  padding: "6px 12px",
  borderRadius: 10,
  background: "linear-gradient(135deg,#f97316,#ef4444)",
  color: "#fff",
  fontWeight: "600",
  boxShadow: "0 0 15px rgba(249,115,22,0.8)"
}

/* 🔥 ACTIONS */
const actions = {
  display: "flex",
  gap: 10,
  marginTop: 15
}

const editBtn = {
  flex: 1,
  padding: 8,
  borderRadius: 8,
  background: "#3b82f6",
  color: "#fff",
  border: "none"
}

const deleteBtn = {
  flex: 1,
  padding: 8,
  borderRadius: 8,
  background: "#ef4444",
  color: "#fff",
  border: "none"
}