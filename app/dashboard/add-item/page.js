"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function AddItem() {
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [category, setCategory] = useState("")
  const [loading, setLoading] = useState(false)

  async function addItem() {
    if (!name || !price) {
      alert("Fill all fields")
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from("menu_items")
      .insert([
        {
          name,
          price: parseInt(price),
          category,
        },
      ])

    if (error) {
      console.error(error)
      alert("Error adding item")
    } else {
      alert("✅ Item added")
      setName("")
      setPrice("")
      setCategory("")
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>➕ Add Menu Item</h1>

      <input
        placeholder="Item Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <br /><br />

      <input
        placeholder="Price"
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <br /><br />

      <input
        placeholder="Category (Pizza, Drinks...)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
      />

      <br /><br />

      <button onClick={addItem} disabled={loading}>
        {loading ? "Adding..." : "Add Item"}
      </button>
    </div>
  )
}