"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

export default function ItemChart({ data = [] }) {
  return (
    <div style={{background:"#111",padding:20,borderRadius:12}}>
      <h3 style={{color:"#fff"}}> Top Selling Items</h3>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data}>
         <XAxis
  dataKey="name"
  stroke="var(--primary)"
  tick={{
    fill:"var(--primary)",
    fontSize:12
  }}
/>
          <YAxis stroke="#cfa004"/>
          <Tooltip
  contentStyle={{
    background:"var(--surface-2)",
    border:"1px solid rgba(var(--primary-rgb),.3)",
    borderRadius:"14px",
    color:"#fff"
  }}
/>
          <Bar dataKey="total" fill="#ddbc01" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}