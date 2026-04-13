"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export default function ItemChart({ data = [] }) {
  return (
    <div style={{background:"#111",padding:20,borderRadius:12}}>
      <h3 style={{color:"#fff"}}>🍽️ Top Selling Items</h3>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="#888"/>
          <YAxis stroke="#888"/>
          <Tooltip />
          <Bar dataKey="total" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}