"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function ReservationPage() {

  const [reservations, setReservations] = useState([])
  const [tables, setTables] = useState([])

  const [form, setForm] = useState({
    name: "",
    phone: "",
    table_id: "",
    date: "",
    time: ""
  })

  const [editId, setEditId] = useState(null)

  useEffect(() => {
    fetchTables()
    fetchReservations()
  }, [])

  // 🔥 FETCH TABLES
  async function fetchTables() {
    const { data, error } = await supabase.from("tables").select("*")

    if (error) {
      console.log(error)
      return
    }

    setTables(data || [])
  }

  // 🔥 FETCH RESERVATIONS (FIXED RELATION)
  async function fetchReservations() {
    const { data, error } = await supabase
      .from("reservations")
      .select(`
        *,
        tables (table_number)
      `)
      .order("created_at", { ascending: false })

    if (error) {
      console.log(error)
      return
    }

    setReservations(data || [])
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  // 🔥 SAVE
  async function saveReservation() {

    if (!form.name || !form.phone || !form.table_id) {
      alert("Fill all fields")
      return
    }

    if (editId) {
      await supabase.from("reservations").update(form).eq("id", editId)
      setEditId(null)
    } else {
      await supabase.from("reservations").insert([
        { ...form, status: "pending" }
      ])
    }

    setForm({
      name: "",
      phone: "",
      table_id: "",
      date: "",
      time: ""
    })

    fetchReservations()
  }

  function editReservation(r) {
    setForm({
      name: r.name,
      phone: r.phone,
      table_id: r.table_id,
      date: r.date,
      time: r.time
    })
    setEditId(r.id)
  }

  async function deleteReservation(id) {
    await supabase.from("reservations").delete().eq("id", id)
    fetchReservations()
  }

  async function updateStatus(id, status) {
    await supabase.from("reservations").update({ status }).eq("id", id)
    fetchReservations()
  }

  return (
    <div style={layout}>

      <h1 style={title}>📅 Reservations</h1>

      {/* 🔥 FORM */}
      <div style={formBox}>

        <input name="name" placeholder="Customer Name" value={form.name} onChange={handleChange} style={input}/>
        <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} style={input}/>

        {/* 🔥 FIXED DROPDOWN */}
        <select name="table_id" value={form.table_id} onChange={handleChange} style={select}>
          <option value="">Select Table</option>
          {tables.map(t => (
            <option key={t.id} value={t.id}>
              Table {t.table_number}
            </option>
          ))}
        </select>

        <input type="date" name="date" value={form.date} onChange={handleChange} style={input}/>
        <input type="time" name="time" value={form.time} onChange={handleChange} style={input}/>

        <button onClick={saveReservation} style={saveBtn}>
          {editId ? "Update" : "Add"}
        </button>

      </div>

      {/* 🔥 CARDS */}
      <div style={grid}>
        {reservations.map(r => (
          <div key={r.id} style={card}>

            <div style={statusChip(r.status)}>
              {r.status}
            </div>

            <h3>{r.name}</h3>
            <p style={muted}>📞 {r.phone}</p>
            <p style={muted}>
              🪑 Table {r.tables?.table_number || "N/A"}
            </p>
            <p style={muted}>
              📅 {r.date || "-"} | ⏰ {r.time || "-"}
            </p>

            <div style={actions}>
              <button onClick={() => editReservation(r)} style={editBtn}>Edit</button>
              <button onClick={() => deleteReservation(r.id)} style={deleteBtn}>Delete</button>
            </div>

            <div style={actions}>
              <button onClick={() => updateStatus(r.id, "confirmed")} style={confirmBtn}>Confirm</button>
              <button onClick={() => updateStatus(r.id, "cancelled")} style={cancelBtn}>Cancel</button>
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
  marginBottom: 25,
  color: "#22c55e"
}

const formBox = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 30,
  padding: 15,
  borderRadius: 15,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(15px)"
}

const input = {
  padding: 10,
  borderRadius: 10,
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#fff"
}

const select = {
  padding: 10,
  borderRadius: 10,
  background: "#020617",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)"
}

const saveBtn = {
  padding: "10px 18px",
  borderRadius: 10,
  background: "#d87707",
  border: "none",
  color: "#fff"
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
  gap: 20
}

const card = {
  padding: 20,
  borderRadius: 20,
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(20px)"
}

const muted = {
  fontSize: 13,
  color: "#94a3b8"
}

const statusChip = (s) => ({
  padding: "5px 10px",
  borderRadius: 20,
  marginBottom: 10,
  background:
    s === "confirmed"
      ? "#22c55e"
      : s === "cancelled"
      ? "#ef4444"
      : "#facc15"
})

const actions = {
  display: "flex",
  gap: 10,
  marginTop: 10
}

const editBtn = {
  flex: 1,
  background: "#3b82f6",
  color: "#fff",
  border: "none",
  padding: 8,
  borderRadius: 8
}

const deleteBtn = {
  flex: 1,
  background: "#ef4444",
  color: "#fff",
  border: "none",
  padding: 8,
  borderRadius: 8
}

const confirmBtn = {
  flex: 1,
  background: "#de560d",
  color: "#fff",
  border: "none",
  padding: 8,
  borderRadius: 8
}

const cancelBtn = {
  flex: 1,
  background: "#dc2626",
  color: "#fff",
  border: "none",
  padding: 8,
  borderRadius: 8
}