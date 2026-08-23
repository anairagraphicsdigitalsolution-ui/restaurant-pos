"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/AuthProvider"

export default function TablesPage() {
  const { restaurantId: authRestaurantId, loading: authLoading } = useAuth()
  const [restaurantId, setRestaurantId] = useState(null)
  const [tables, setTables] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let channel
    let timer

    async function init() {
      if (authLoading) return
      if (!authRestaurantId) {
        setLoading(false)
        return
      }

      setRestaurantId(authRestaurantId)
      await load(authRestaurantId)

      channel = supabase
        .channel(`tables-${authRestaurantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${authRestaurantId}` },
          () => load(authRestaurantId)
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tables", filter: `restaurant_id=eq.${authRestaurantId}` },
          () => load(authRestaurantId)
        )
        .subscribe()

      timer = setInterval(() => load(authRestaurantId), 15000)
    }
    init()

    return () => {
      if (timer) clearInterval(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [authLoading, authRestaurantId])

  async function load(rid = restaurantId) {
    if (!rid) return
    setLoading(true)

    const [{ data: tableData }, { data: orderData }] = await Promise.all([
      supabase.from("tables").select("*").eq("restaurant_id", rid).order("table_number"),
      supabase.from("orders").select("id,source_type,source_id,status,total_amount,payment_status,created_at,source_label")
        .eq("restaurant_id", rid)
        .in("status", ["pending", "accepted", "preparing", "ready", "served"])
        .order("created_at", { ascending: false })
    ])

    setTables(tableData || [])
    setOrders(orderData || [])
    setLoading(false)
  }

  const tableMap = useMemo(() => {
    const map = {}
    for (const table of tables) map[String(table.id)] = table
    return map
  }, [tables])

  function getOrder(tableId) {
    return orders.find(o =>
      o.source_type === "table" && String(o.source_id) === String(tableId) && o.payment_status !== "paid"
    )
  }

  function statusFor(tableId) {
    const order = getOrder(tableId)
    if (!order) return { key: "available", label: "Available", order: null }
    if (order.status === "ready") return { key: "ready", label: "Ready", order }
    if (order.status === "served") return { key: "billing", label: "Billing", order }
    return { key: "occupied", label: "Occupied", order }
  }

  return (
    <div style={styles.page} className="tables-page">
      <div style={styles.hero}>
        <div>
          <div style={styles.eyebrow}>LIVE FLOOR</div>
          <h1 style={styles.title}>Table Management</h1>
          <p style={styles.sub}>See availability, active orders and table status in real time.</p>
        </div>
        <button style={styles.refresh} onClick={() => load()}>↻ Refresh</button>
      </div>

      <div style={styles.legend}>
        <span><i style={{...styles.dot,background:"#22c55e"}} /> Available</span>
        <span><i style={{...styles.dot,background:"#ef4444"}} /> Occupied</span>
        <span><i style={{...styles.dot,background:"#f59e0b"}} /> Ready</span>
        <span><i style={{...styles.dot,background:"#8b5cf6"}} /> Billing</span>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading tables…</div>
      ) : tables.length === 0 ? (
        <div style={styles.empty}>No tables found. Add tables from the dashboard.</div>
      ) : (
        <div style={styles.grid}>
          {tables.map(table => {
            const status = statusFor(table.id)
            return (
              <div key={table.id} style={{...styles.card, ...styles[status.key]}}>
                <div style={styles.cardTop}>
                  <div>
                    <span style={styles.small}>TABLE</span>
                    <h2 style={styles.tableNo}>T{String(table.table_number).padStart(2,"0")}</h2>
                  </div>
                  <span style={styles.badge}>{status.label}</span>
                </div>

                <div style={styles.seats}>👥 {table.seats || 4} seats</div>

                {status.order ? (
                  <div style={styles.orderBox}>
                    <div><b>Order #{String(status.order.id).slice(0,6)}</b></div>
                    <div style={styles.orderMeta}>{status.order.status} • ₹{Number(status.order.total_amount || 0).toFixed(0)}</div>
                    <div style={styles.orderMeta}>{new Date(status.order.created_at).toLocaleTimeString()}</div>
                  </div>
                ) : (
                  <div style={styles.availableBox}>Ready for the next guest</div>
                )}

                <button
                  style={styles.qrButton}
                  onClick={() => window.location.href = `/dashboard/qr?type=table&id=${table.id}`}
                >
                  📱 Table QR
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    minHeight:"100vh",
    padding:"28px",
    color:"#fff",
    background:"linear-gradient(180deg,#020617,#07111f)",
    fontFamily:"Inter,system-ui,sans-serif"
  },
  hero:{display:"flex",justifyContent:"space-between",alignItems:"end",gap:20,marginBottom:22,flexWrap:"wrap"},
  eyebrow:{color:"#fbbf24",fontSize:12,fontWeight:900,letterSpacing:2},
  title:{fontSize:38,margin:"8px 0"},
  sub:{color:"#94a3b8",margin:0},
  refresh:{border:"1px solid rgba(251,191,36,.3)",background:"rgba(251,191,36,.08)",color:"#fbbf24",padding:"11px 15px",borderRadius:11,fontWeight:800,cursor:"pointer"},
  legend:{display:"flex",gap:18,flexWrap:"wrap",color:"#94a3b8",fontSize:12,marginBottom:20},
  dot:{width:9,height:9,borderRadius:"50%",display:"inline-block",marginRight:6},
  grid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:16},
  card:{padding:18,borderRadius:20,background:"#0d1726",border:"1px solid #1e293b",minHeight:220,boxShadow:"0 18px 45px rgba(0,0,0,.22)"},
  available:{borderColor:"rgba(34,197,94,.28)"},
  occupied:{borderColor:"rgba(239,68,68,.32)"},
  ready:{borderColor:"rgba(245,158,11,.35)"},
  billing:{borderColor:"rgba(139,92,246,.35)"},
  cardTop:{display:"flex",justifyContent:"space-between",gap:12},
  small:{fontSize:9,color:"#64748b",letterSpacing:1.5},
  tableNo:{fontSize:30,margin:"4px 0 0"},
  badge:{fontSize:10,fontWeight:900,color:"#f8fafc",padding:"6px 8px",borderRadius:999,background:"rgba(255,255,255,.08)",height:"fit-content"},
  seats:{marginTop:15,color:"#94a3b8",fontSize:12},
  orderBox:{marginTop:16,padding:12,borderRadius:12,background:"rgba(255,255,255,.035)",border:"1px solid rgba(255,255,255,.06)"},
  orderMeta:{fontSize:10,color:"#94a3b8",marginTop:5},
  availableBox:{marginTop:16,padding:12,borderRadius:12,background:"rgba(34,197,94,.06)",color:"#86efac",fontSize:11},
  qrButton:{width:"100%",marginTop:13,border:0,borderRadius:10,padding:10,background:"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#111827",fontWeight:900,cursor:"pointer"},
  empty:{padding:40,textAlign:"center",color:"#94a3b8",border:"1px dashed #334155",borderRadius:18}
}
