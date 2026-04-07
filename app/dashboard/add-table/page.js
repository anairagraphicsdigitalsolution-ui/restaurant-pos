"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function AddTable() {
  const [tableName, setTableName] = useState("")
  const [loading, setLoading] = useState(false)

  async function addTable() {
    if (!tableName) {
      alert("Enter table name")
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from("tables")
      .insert([
        {
          name: tableName,
        },
      ])

    if (error) {
      console.error(error)
      alert("Error adding table")
    } else {
      alert("✅ Table added")
      setTableName("")
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🪑 Add Table</h1>

      <input
        placeholder="Table Name (Table 1, Table 2...)"
        value={tableName}
        onChange={(e) => setTableName(e.target.value)}
      />

      <br /><br />

      <button onClick={addTable} disabled={loading}>
        {loading ? "Adding..." : "Add Table"}
      </button>
    </div>
  )
}