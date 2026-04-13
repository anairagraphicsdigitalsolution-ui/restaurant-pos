"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import SalesChart from "@/components/SalesChart"
import ItemChart from "@/components/ItemChart"
import jsPDF from "jspdf"
import html2canvas from "html2canvas"

export default function BillingPage() {

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState("")
  const [items, setItems] = useState([])
  const [restaurant, setRestaurant] = useState(null)
  const [currentOrder, setCurrentOrder] = useState(null)

  const [showAllOrders, setShowAllOrders] = useState(false)

  const [gstRate, setGstRate] = useState(5)
  const [gstEnabled, setGstEnabled] = useState(true)

  const [editMode, setEditMode] = useState(false)

  const [reportDate, setReportDate] = useState("")
  const [reportEndDate, setReportEndDate] = useState("")

  const [reportTotals, setReportTotals] = useState({})
  const [itemChartData, setItemChartData] = useState([])

  const [invoiceNo, setInvoiceNo] = useState("")

  // ✅ GST persist
  useEffect(() => {
    const saved = localStorage.getItem("gstEnabled")
    if (saved !== null) setGstEnabled(saved === "true")
  }, [])

  useEffect(() => {
    localStorage.setItem("gstEnabled", gstEnabled)
  }, [gstEnabled])

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
    const itemMap = {}

    for (let o of data || []) {

      const { data: oi } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", o.id)

      if (!oi) continue

      const ids = oi.map(i => i.item_id || i.menu_item_id)

      const { data: menu } = await supabase
        .from("menu_items")
        .select("id,name,price")
        .in("id", ids)

      let sum = 0

      oi.forEach(i => {
        const m = menu?.find(mm => String(mm.id) === String(i.item_id || i.menu_item_id))

        const price = m?.price || 0
        const name = m?.name || "Item"
        const qty = i.quantity || 0

        sum += qty * price

        if (!itemMap[name]) itemMap[name] = 0
        itemMap[name] += qty * price
      })

      totals[o.id] = gstEnabled ? sum + (sum * gstRate)/100 : sum
    }

    setReportTotals(totals)

    setItemChartData(
      Object.keys(itemMap).map(name => ({
        name,
        total: itemMap[name]
      }))
    )
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

    if (!orderItems) return

    const ids = orderItems.map(i => i.item_id || i.menu_item_id)

    const { data: menuData } = await supabase
      .from("menu_items")
      .select("id,name,price")
      .in("id", ids)

    const finalItems = orderItems.map(i => {
      const menu = menuData?.find(m => String(m.id) === String(i.item_id || i.menu_item_id))
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

  const chartMap = {}
  filteredOrders.forEach(o => {
    const date = o.created_at.split("T")[0]
    if (!chartMap[date]) chartMap[date] = 0
    chartMap[date] += reportTotals[o.id] || 0
  })

  const chartData = Object.keys(chartMap).map(date => ({
    date,
    total: chartMap[date]
  }))

  function printContent(id){
    const content = document.getElementById(id).innerHTML
    const win = window.open("", "_blank")
    win.document.write(`<html><body>${content}</body></html>`)
    win.print()
  }

  return (
    <div style={layout}>

      <h1 style={title}>💰 Billing Dashboard</h1>

      <div style={topBar}>
        <button onClick={()=>setShowAllOrders(!showAllOrders)} style={btnBlue}>
          {showAllOrders ? "Recent 5" : "All Orders"}
        </button>

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

      <div style={summaryWrap}>
        <div style={summaryCard}><p>Total</p><h2>₹{reportTotal.toFixed(0)}</h2></div>
        <div style={summaryCard}><p>Orders</p><h2>{filteredOrders.length}</h2></div>
        <div style={summaryCard}><p>Avg</p><h2>₹{(reportTotal/(filteredOrders.length||1)).toFixed(0)}</h2></div>
      </div>

      <SalesChart data={chartData} />
      <ItemChart data={itemChartData} />

      <div style={mainGrid}>

        {/* LEFT */}
        <div style={leftPanel}>

          <div style={card}>
            <h3>GST Settings</h3>
            <label>
              <input type="checkbox" checked={gstEnabled} onChange={()=>setGstEnabled(!gstEnabled)} />
              Enable GST
            </label>

            {gstEnabled && (
              <input type="number" value={gstRate} onChange={(e)=>setGstRate(Number(e.target.value))} style={input}/>
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

        {/* BILL */}
        <div style={{overflowX:"auto"}}>
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
                <tbody>
                  {items.map((i,idx)=>(
                    <tr key={idx}>
                      <td style={td}>{i.menu_items.name}</td>
                      <td style={td}>
                        {editMode ? <input value={i.quantity} onChange={(e)=>updateQty(idx,e.target.value)} /> : i.quantity}
                      </td>
                      <td style={td}>
                        {editMode ? <input value={i.menu_items.price} onChange={(e)=>updatePrice(idx,e.target.value)} /> : `₹${i.menu_items.price}`}
                      </td>
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

/* UI */

const layout = { background:"#020617", color:"#fff", padding:20 }
const title = { fontSize:28, marginBottom:20 }

const topBar = { display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }

const mainGrid = {
  display:"grid",
  gridTemplateColumns:"minmax(280px,340px) 1fr",
  gap:20,
  alignItems:"start"
}

const leftPanel = {
  display:"flex",
  flexDirection:"column",
  gap:20,
  position:"sticky",
  top:20,
  height:"fit-content"
}

const card = { background:"#111", padding:20, borderRadius:12 }

const billCard = {
  background:"#fff",
  color:"#000",
  padding:25,
  borderRadius:12,
  overflowX:"auto"
}

const invoiceHeader = { display:"flex", justifyContent:"space-between", marginBottom:10 }

const table = {
  width:"100%",
  borderCollapse:"collapse",
  tableLayout:"fixed"
}

const th = { borderBottom:"2px solid #ccc", padding:"10px", textAlign:"left" }

const td = {
  padding:"10px",
  borderBottom:"1px solid #eee",
  wordBreak:"break-word"
}

const totalBox = { textAlign:"right", marginTop:15 }

const input = { padding:10, borderRadius:8 }

const btnBlue = {
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

const summaryWrap = {
  display:"flex",
  gap:15,
  marginBottom:20,
  flexWrap:"wrap"
}

const summaryCard = {
  background:"#111",
  padding:20,
  borderRadius:12,
  flex:1,
  textAlign:"center"
}