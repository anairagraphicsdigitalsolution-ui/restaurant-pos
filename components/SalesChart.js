"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from "recharts"

export default function SalesChart({ data = [] }) {

  // 🔥 Custom Tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: "#000",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #333",
          color: "#fff"
        }}>
          <p style={{margin:0}}>📅 {label}</p>
          <p style={{margin:0}}>💰 ₹{payload[0].value}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div style={container}>

      <div style={header}>
        <h3 style={title}>📈 Sales Analytics</h3>
        <p style={sub}>Daily Revenue Overview</p>
      </div>

      {/* 🔥 CHART */}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>

          {/* Grid */}
          <CartesianGrid stroke="#222" strokeDasharray="3 3" />

          {/* Axis */}
          <XAxis dataKey="date" stroke="#888" />
          <YAxis stroke="#888" />

          {/* Tooltip */}
          <Tooltip content={<CustomTooltip />} />

          {/* Line */}
          <Line
            type="monotone"
            dataKey="total"
            stroke="#22c55e"
            strokeWidth={3}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />

        </LineChart>
      </ResponsiveContainer>

    </div>
  )
}

/* 🎨 STYLES */

const container = {
  background: "linear-gradient(145deg, #0f172a, #020617)",
  padding: 20,
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
  marginTop: 10
}

const header = {
  marginBottom: 10
}

const title = {
  margin: 0,
  color: "#fff"
}

const sub = {
  margin: 0,
  fontSize: 12,
  color: "#94a3b8"
}