"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function AddRoom() {
  const [roomNumber, setRoomNumber] = useState("")
  const [loading, setLoading] = useState(false)

  async function addRoom() {
    if (!roomNumber) {
      alert("Enter room number")
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from("rooms")
      .insert([
        {
          room_number: roomNumber,
        },
      ])

    if (error) {
      console.error(error)
      alert("Error adding room")
    } else {
      alert("✅ Room added")
      setRoomNumber("")
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🏨 Add Room</h1>

      <input
        placeholder="Room Number (101, 102...)"
        value={roomNumber}
        onChange={(e) => setRoomNumber(e.target.value)}
      />

      <br /><br />

      <button onClick={addRoom} disabled={loading}>
        {loading ? "Adding..." : "Add Room"}
      </button>
    </div>
  )
}