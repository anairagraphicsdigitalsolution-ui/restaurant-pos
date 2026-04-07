"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function BillingPage() {

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState("")
  const [items, setItems] = useState([])
  const [restaurant, setRestaurant] = useState(null)
  const [currentOrder, setCurrentOrder] = useState(null)

  const [showAllOrders, setShowAllOrders] = useState(false) // 🔥 NEW

  const [gstRate, setGstRate] = useState(5)
  const [gstEnabled, setGstEnabled] = useState(true)

  const [editMode, setEditMode] = useState(false)

  const [reportDate, setReportDate] = useState("")
  const [reportEndDate, setReportEndDate] = useState("")

  const [reportTotals, setReportTotals] = useState({})

  useEffect(() => { init() }, [])

  async function init() {
    const { data: auth } = await supabase.auth.getUser()
    if (!auth?.user) return

    const { data: profile } = await supabase
      .from("profiles")
      .select("restaurant_id")
      .eq("id", auth.user.id)
      .single()

    const restId = profile?.restaurant_id
    if (!restId) return

    fetchRestaurant(restId)
    fetchOrders(restId)
  }

  async function fetchRestaurant(restId) {
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", restId)
      .single()

    setRestaurant(data)
  }

  async function fetchOrders(restId) {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", restId)
      .eq("status", "done")
      .order("created_at", { ascending: false })

    setOrders(data || [])

    const totals = {}

    for (let o of data || []) {
      const { data: oi } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", o.id)

      const ids = oi.map(i => i.item_id || i.menu_item_id)

      const { data: menu } = await supabase
        .from("menu_items")
        .select("id,price")
        .in("id", ids)

      let sum = 0

      oi.forEach(i => {
        const m = menu.find(mm => String(mm.id) === String(i.item_id || i.menu_item_id))
        sum += (i.quantity || 0) * (m?.price || 0)
      })

      const gst = gstEnabled ? (sum * gstRate) / 100 : 0
      totals[o.id] = sum + gst
    }

    setReportTotals(totals)
  }

  useEffect(() => {
    if (orders.length) {
      fetchOrders(orders[0]?.restaurant_id)
    }
  }, [gstEnabled, gstRate])

  async function loadBill(orderId) {

    const selected = orders.find(o => o.id === orderId)
    setCurrentOrder(selected)
    setSelectedOrder(orderId)

    const { data: orderItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)

    const ids = orderItems.map(i => i.item_id || i.menu_item_id)

    const { data: menuData } = await supabase
      .from("menu_items")
      .select("id,name,price")
      .in("id", ids)

    const finalItems = orderItems.map(i => {
      const menu = menuData.find(m => String(m.id) === String(i.item_id || i.menu_item_id))
      return {
        quantity: Number(i.quantity || 0),
        menu_items: { ...menu }
      }
    })

    setItems(finalItems)
  }

  function updateQty(index, value) {
    const updated = [...items]
    updated[index].quantity = Number(value)
    setItems(updated)
  }

  function updatePrice(index, value) {
    const updated = [...items]
    updated[index].menu_items.price = Number(value)
    setItems(updated)
  }

  const subtotal = items.reduce((s,i)=> s+i.quantity*i.menu_items.price,0)
  const gst = gstEnabled ? (subtotal * gstRate)/100 : 0
  const total = subtotal + gst

  function formatDate(date){
    return new Date(date).toLocaleString("en-IN")
  }

  const today = new Date().toISOString().split("T")[0]

  const filteredOrders = orders.filter(o=>{
    if(!reportDate) return o.created_at.startsWith(today)
    if(!reportEndDate) return o.created_at.startsWith(reportDate)
    return o.created_at >= reportDate && o.created_at <= reportEndDate+"T23:59:59"
  })

  const reportTotal = filteredOrders.reduce(
    (s,o)=> s+(reportTotals[o.id] || 0),
    0
  )

  function printContent(id){
    const content = document.getElementById(id).innerHTML
    const win = window.open("", "_blank")
    win.document.write(`<html><body>${content}</body></html>`)
    win.print()
  }

  return (
    <div style={layout}>

      <h1 style={title}>💰 Billing Dashboard</h1>

      {/* 🔥 TOP BAR */}
      <div style={topBar}>

        {/* 🔥 NEW TOGGLE BUTTON */}
        <button
          onClick={()=>setShowAllOrders(!showAllOrders)}
          style={btnBlue}
        >
          {showAllOrders ? "Show Recent 5" : "Show All Orders"}
        </button>

        {/* 🔥 UPDATED DROPDOWN */}
        <select onChange={(e)=>loadBill(e.target.value)} style={input}>
          <option>Select Order</option>

          {(showAllOrders ? orders : orders.slice(0,5)).map(o=>(
            <option key={o.id} value={o.id}>
              #{o.id.slice(0,5)} | {formatDate(o.created_at)}
            </option>
          ))}
        </select>

        <input type="date" value={reportDate} onChange={(e)=>setReportDate(e.target.value)} style={input}/>
        <input type="date" value={reportEndDate} onChange={(e)=>setReportEndDate(e.target.value)} style={input}/>

      </div>

      {/* बाकी code SAME */}
      <div style={mainGrid}>
        {/* LEFT */}
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div style={card}>
            <h3>GST Settings</h3>

            <label>
              <input
                type="checkbox"
                checked={gstEnabled}
                onChange={()=>setGstEnabled(!gstEnabled)}
              />
              Enable GST
            </label>

            {gstEnabled && (
              <input
                type="number"
                value={gstRate}
                onChange={(e)=>setGstRate(Number(e.target.value))}
                style={input}
              />
            )}
          </div>

          <div id="report-print" style={card}>
            <h3>📊 Report</h3>

            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Order</th>
                  <th style={th}>Date</th>
                  <th style={th}>Amount</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map(o=>(
                  <tr key={o.id}>
                    <td style={td}>#{o.id.slice(0,5)}</td>
                    <td style={td}>{formatDate(o.created_at)}</td>
                    <td style={td}>₹{reportTotals[o.id]?.toFixed(2) || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2>Total: ₹{reportTotal.toFixed(2)}</h2>

            <button onClick={()=>printContent("report-print")} style={btnBlue}>
              Print Report
            </button>
          </div>
        </div>

        {/* BILL SAME */}
        <div>
          {selectedOrder && (
            <div id="bill-print" style={billCard}>
              <div style={invoiceHeader}>
                <div>
                  <h2>{restaurant?.name}</h2>
                  <p>{restaurant?.address}</p>
                </div>

                <div style={{textAlign:"right"}}>
                  <h3>INVOICE</h3>
                  <p>#{selectedOrder}</p>
                  <p>{formatDate(currentOrder?.created_at)}</p>
                </div>
              </div>

              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Item</th>
                    <th style={th}>Qty</th>
                    <th style={th}>Rate</th>
                    <th style={th}>Total</th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((i,idx)=>(
                    <tr key={idx}>
                      <td style={td}>{i.menu_items.name}</td>
                      <td style={td}>{i.quantity}</td>
                      <td style={td}>₹{i.menu_items.price}</td>
                      <td style={td}>₹{i.quantity * i.menu_items.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={totalBox}>
                <p>Subtotal: ₹{subtotal}</p>
                {gstEnabled && <p>GST: ₹{gst.toFixed(2)}</p>}
                <h2>Total: ₹{total.toFixed(2)}</h2>
              </div>

              <button onClick={()=>setEditMode(!editMode)} style={btnBlue}>
                {editMode ? "Save Changes" : "Edit Bill"}
              </button>

              <button onClick={()=>printContent("bill-print")} style={btnGreen}>
                Print Invoice
              </button>

            </div>
          )}
        </div>

      </div>
    </div>
  )
}

/* SAME UI */

/* SAME UI */

/* UI */

const layout = { background:"#020617", color:"#fff", padding:20 }
const title = { fontSize:28, marginBottom:20 }

const topBar = { display:"flex", gap:10, marginBottom:20 }

const mainGrid = { display:"grid", gridTemplateColumns:"350px 1fr", gap:20 }

const card = { background:"#111", padding:20, borderRadius:12 }

const billCard = { background:"#fff", color:"#000", padding:25, borderRadius:12 }

const invoiceHeader = { display:"flex", justifyContent:"space-between", marginBottom:10 }

const table = { width:"100%", borderCollapse:"collapse" }

const th = {
  borderBottom:"2px solid #ccc",
  padding:"10px",
  textAlign:"left"
}

const td = {
  padding:"10px",
  borderBottom:"1px solid #eee"
}

const totalBox = { textAlign:"right", marginTop:15 }

const input = { padding:10, borderRadius:8 }

const btnBlue = {
  marginTop:10,
  padding:10,
  background:"#6366f1",
  border:"none",
  borderRadius:8,
  color:"#fff"
}

const btnGreen = {
  marginTop:10,
  padding:12,
  background:"#22c55e",
  border:"none",
  borderRadius:10,
  width:"100%"
}