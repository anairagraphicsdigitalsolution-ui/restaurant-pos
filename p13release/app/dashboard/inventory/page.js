"use client"
import { formatIndiaDate, formatIndiaDateTime } from "@/lib/indiaTime"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import Barcode from "react-barcode"
import {
BarChart,
Bar,
XAxis,
YAxis,
Tooltip,
ResponsiveContainer,
PieChart,
Pie,
Cell
} from "recharts"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { sendThermalPrint } from "@/lib/thermalPrintClient"
import { printHtmlInFrame } from "@/lib/printUtils"

export default function Inventory() {
 const [items, setItems] = useState([])
 const [restaurant, setRestaurant] = useState(null)

const [name, setName] = useState("")
const [qty, setQty] = useState("")
const [unit, setUnit] = useState("kg")

const [category, setCategory] = useState("Vegetables")
const [supplier, setSupplier] = useState("")
const [minStock, setMinStock] = useState(0)

const [search, setSearch] = useState("")
const [filter, setFilter] = useState("all")

const [editingId, setEditingId] = useState(null)

const [tableView, setTableView] = useState(false)

const [sortBy, setSortBy] = useState("name")

const [categoryFilter, setCategoryFilter] = useState("all")

const [selectedItem, setSelectedItem] = useState(null)

const [showDetails, setShowDetails] = useState(false)

const [loading, setLoading] = useState(false)


const [costPrice,setCostPrice]=useState("")

const [expiryDate,setExpiryDate]=useState("")
const [notes,setNotes]=useState("")
const [useItem, setUseItem] = useState("")
const [useQty, setUseQty] = useState("")
const [useReason, setUseReason] = useState("Kitchen")
const [usageHistory, setUsageHistory] = useState([])
const [stats,setStats]=useState({
totalCategories:0
})
useEffect(() => {
  loadRestaurant()
}, [])

async function loadRestaurant() {

  const { data: userData } = await supabaseCloud.auth.getUser()

  if (!userData?.user) {
    alert("Login required")
    return
  }

  // Use the tenant link stored on the user's profile first.
  // Some legacy restaurants have owner_id = NULL, so owner_id alone
  // is not a reliable tenant resolver.
  const { data: profile, error: profileError } = await supabaseCloud
    .from("profiles")
    .select("restaurant_id, role")
    .eq("id", userData.user.id)
    .maybeSingle()

  if (profileError) {
    console.error("Unable to load profile:", profileError)
  }

  const metadataRestaurantId =
    userData.user.user_metadata?.restaurant_id ||
    userData.user.app_metadata?.restaurant_id ||
    null

  const resolvedRestaurantId =
    profile?.restaurant_id || metadataRestaurantId || null

  let rest = null

  if (resolvedRestaurantId) {
    const { data, error } = await supabaseCloud
      .from("restaurants")
      .select("*")
      .eq("id", resolvedRestaurantId)
      .maybeSingle()

    if (error) {
      console.error("Unable to load restaurant:", error)
    }
    rest = data || null
  }

  // Legacy fallback.
  if (!rest) {
    const { data, error } = await supabaseCloud
      .from("restaurants")
      .select("*")
      .eq("owner_id", userData.user.id)
      .limit(1)

    if (error) {
      console.error("Owner restaurant lookup failed:", error)
    }
    rest = data?.[0] || null
  }

  if (!rest) {
    alert("Restaurant not linked")
    return
  }

  setRestaurant(rest)

}

  useEffect(()=>{
  if(restaurant){
    fetchItems()
  }
},[restaurant])
async function handleNameChange(e) {

  const value = e.target.value

  setName(value)

  if (!restaurant || !value) return

  const { data } = await supabaseCloud
    .from("inventory")
    .select("min_stock")
    .eq("restaurant_id", restaurant.id)
    .ilike("name", value)
    .limit(1)

  if (data && data.length > 0) {
    setMinStock(data[0].min_stock ?? 0)
  } else {
    setMinStock(0)
  }

}

  async function fetchItems(){

setLoading(true)

const {data,error}=await supabaseCloud

.from("inventory")
.select("*")
.eq("restaurant_id",restaurant.id)

.order("name")

if(error){

console.log(error)

setLoading(false)

return

}

setItems(data||[])

const categories=

new Set(

(data||[]).map(

i=>i.category

)

)


setStats({
totalCategories:categories.size
})



setLoading(false)

}

  async function addItem() {
   
    if (!restaurant) {
  alert("Restaurant not loaded")
  return
}

  if (!name || !qty) {

    alert("Fill all fields")

    return

  }

  if (editingId) {

    await supabaseCloud

      .from("inventory")

      .update({

        name,

        quantity:Number(qty),
        restaurant_id:restaurant.id,

        unit,

        category,

        supplier,

        min_stock:Number(minStock),

cost_price:Number(costPrice)||0,



expiry_date:expiryDate,

notes:notes

      })

      .eq("id",editingId)
.eq("restaurant_id",restaurant.id)

    setEditingId(null)

  }

  else{

    await supabaseCloud

.from("inventory")

.insert([

{
name,
restaurant_id:restaurant.id,
quantity:Number(qty),
unit,

category,

supplier,

min_stock:Number(minStock),

sku:

Math.random()

.toString(36)

.substring(2,8)

.toUpperCase(),

cost_price:Number(costPrice)||0,

expiry_date:expiryDate,

notes:notes,

created_at:new Date().toISOString()

}

])

  }

  setName("")

  setQty("")

  setUnit("kg")

  setCategory("Vegetables")

  setSupplier("")

  setMinStock(0)

setCostPrice("")

setExpiryDate("")
setNotes("")

fetchItems()

}
    

  async function updateStock(id, change){

  if (!restaurant) return

  try {
    const { data: sessionData } = await supabaseCloud.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) throw new Error("Login session expired")

    const response = await fetch("/api/inventory/adjust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        inventory_id: id,
        delta: Number(change),
        reason: change > 0 ? "Manual stock addition" : "Manual stock reduction"
      })
    })

    const result = await response.json()
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Stock update failed")
    }

    await fetchItems()
  } catch (error) {
    console.error(error)
    alert(error.message || "Stock update failed")
  }
}
function editItem(item){

setEditingId(item.id)

setName(item.name)

setQty(item.quantity)

setUnit(item.unit)

setCategory(item.category||"Vegetables")

setSupplier(item.supplier||"")

setMinStock(item.min_stock ?? 0)

setCostPrice(item.cost_price||"")



setExpiryDate(item.expiry_date||"")

setNotes(item.notes||"")

}
function viewItem(item){

setSelectedItem(item)

setShowDetails(true)

}
async function deleteItem(id){

const ok=window.confirm(

"Delete this item?"

)

if(!ok) return

await supabaseCloud

.from("inventory")

.delete()
.eq("id",id)
.eq("restaurant_id",restaurant.id)

fetchItems()

}

    
  const filteredItems=

items

.filter(item=>{

const keyword=

search.toLowerCase()

const match=

item.name

.toLowerCase()

.includes(keyword)

||

(item.category||"")

.toLowerCase()

.includes(keyword)

||

(item.supplier||"")

.toLowerCase()

.includes(keyword)

||

(item.sku||"")

.toLowerCase()

.includes(keyword)

if(!match) return false

if(categoryFilter!=="all"

&&

item.category!==categoryFilter)

return false

if(filter==="low")

return item.quantity<=(item.min_stock ?? 0)

&&

item.quantity>0

if(filter==="out")

return item.quantity===0

if(filter==="available")

return item.quantity>(item.min_stock ?? 0)

return true

})

.sort((a,b)=>{

switch(sortBy){

case"qty":

return b.quantity-a.quantity

case"category":

return(a.category||"")

.localeCompare(

b.category||""

)

default:

return a.name

.localeCompare(

b.name

)

}

})
async function useStock() {

  if (!useItem || !useQty) {
    alert("Select item and quantity")
    return
  }

  const item = items.find(i => i.id === useItem)
  if (!item) {
    alert("Item not found")
    return
  }

  const quantity = Number(useQty)
  if (!Number.isInteger(quantity) || quantity < 1) {
    alert("Enter a valid quantity")
    return
  }

  if (quantity > Number(item.quantity)) {
    alert("Not enough stock")
    return
  }

  const ok = window.confirm(`Use ${quantity} ${item.unit} of ${item.name}?`)
  if (!ok) return

  try {
    const { data: sessionData } = await supabaseCloud.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) throw new Error("Login session expired")

    const response = await fetch("/api/inventory/adjust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        inventory_id: item.id,
        delta: -quantity,
        reason: useReason || "Kitchen"
      })
    })

    const result = await response.json()
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Unable to use stock")
    }

    const { error: usageError } = await supabaseCloud
      .from("stock_usage")
      .insert([{
        restaurant_id: restaurant.id,
        inventory_id: item.id,
        item_name: item.name,
        used_qty: quantity,
        unit: item.unit,
        reason: useReason || "Kitchen"
      }])

    if (usageError) {
      console.warn("Stock updated, but usage history failed:", usageError)
    }

    setUseItem("")
    setUseQty("")
    setUseReason("Kitchen")
    await fetchItems()
    await fetchUsageHistory()
    alert("Stock Updated")
  } catch (error) {
    console.error(error)
    alert(error.message || "Unable to use stock")
  }
}

async function fetchUsageHistory(){

  const { data, error } = await supabaseCloud
    .from("stock_usage")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at", { ascending:false })

  if(error){
    console.log(error)
    return
  }

  setUsageHistory(data || [])
}
function exportCSV(){

const headers=[

"Name",
"Category",
"Quantity",
"Unit",
"Supplier",
"Cost Price",
"SKU"

]

const rows=filteredItems.map(item=>[

item.name,

item.category,

item.quantity,

item.unit,

item.supplier,

item.cost_price,


item.sku

])

const csv=[

headers,

...rows

]

.map(e=>e.join(","))

.join("\n")

const blob=new Blob([csv],{

type:"text/csv"

})

const url=

URL.createObjectURL(blob)

const a=document.createElement("a")

a.href=url

a.download="inventory.csv"

a.click()

URL.revokeObjectURL(url)

}

async function printInventory(){
  const tables = Array.from(document.querySelectorAll("table")).map(t => t.outerHTML).join("<hr/>")
  const html = `<div style="font-family:Arial,sans-serif;color:#111;padding:8mm"><h2 style="margin:0 0 4px">${restaurant?.name || "Restaurant"}</h2><div style="font-size:12px;margin-bottom:10px">INVENTORY REPORT</div>${tables}</div>`
  try { await printHtmlInFrame(html, { title: `${restaurant?.name || "Restaurant"} Inventory`, width: "210mm", height: "297mm" }) } catch (e) { alert(e.message || "Unable to print inventory") }
}

async function printInventoryThermal(){
  try {
    const rows = (items || []).map(i => `${i.name || "Item"}: ${Number(i.quantity || 0)} ${i.unit || ""}`)
    await sendThermalPrint({ type: "inventory-report", content: [restaurant?.name || "Restaurant", "INVENTORY REPORT", "------------------------------", ...rows, "------------------------------", `Items: ${items.length}`].join("\n"), data: { size: "80mm" } })
    alert("Thermal inventory report sent to printer")
  } catch (e) { alert(e.message || "Thermal inventory print failed") }
}

const totalItems=

items.length

const totalStock=

items.reduce(

(a,b)=>a+b.quantity,

0

)

const lowStock=


items.filter(

i=>

i.quantity<=

(i.min_stock?? 0)

&&

i.quantity>0

).length

const outStock=

items.filter(

i=>i.quantity===0

).length



const expiringItems=

items.filter(item=>{

if(!item.expiry_date) return false

const today=new Date()

const expiry=new Date(item.expiry_date)

const diff=Math.ceil(

(expiry-today)/(1000*60*60*24)

)

return diff<=7

})

const chartData = [
{
name:"Available",
value:items.filter(
i=>i.quantity>(i.min_stock?? 0)
).length
},
{
name:"Low",
value:lowStock
},
{
name:"Out",
value:outStock
}
]
const selectedInventory = items.find(
  i => i.id === useItem
)
const categoryData = [...new Set(
items.map(i=>i.category||"Others")
)].map(cat=>({

name:cat,

count:items.filter(
i=>(i.category||"Others")===cat
).length

}))

  return (
    <div style={layout}>

      {/* HEADER */}

<div style={hero}>

<div>

<div style={welcomeBadge}>

🍽 Restaurant Inventory

</div>

<h1 style={heroTitle}>

Welcome Back 👋

</h1>

<h2 style={restaurantName}>
{restaurant?.name || "Restaurant Dashboard"}
</h2>

<p style={heroSub}>

Track stock, expiry dates, suppliers and kitchen inventory in real time.

</p>

</div>



<div style={heroRight}>

<div style={liveBadge}>
🟢 LIVE
</div>

<div style={dateCard}>
{formatIndiaDate(new Date())}
</div>



</div>



</div>
<div style={statsGrid}>

<div style={premiumCard}>
<div style={iconCircle}>📦</div>
<h2>{totalItems}</h2>
<p>Total Items</p>
</div>

<div style={premiumCard}>
<div style={iconCircle}>📊</div>
<h2>{totalStock}</h2>
<p>Total Quantity</p>
</div>

<div style={premiumCard}>
<div style={iconCircle}>⚠️</div>
<h2>{lowStock}</h2>
<p>Low Stock</p>
</div>

<div style={premiumCard}>
<div style={iconCircle}>❌</div>
<h2>{outStock}</h2>
<p>Out Of Stock</p>
</div>

<div style={premiumCard}>
<div style={iconCircle}>⏰</div>
<h2>{expiringItems.length}</h2>
<p>Expiring Soon</p>
</div>

<div style={premiumCard}>
<div style={iconCircle}>🏷️</div>
<h2>{stats.totalCategories}</h2>
<p>Categories</p>
</div>
</div>
<div style={quickActions}>
  <button

style={actionButton}

onClick={exportCSV}

>

📄 Export CSV

</button>

<button

style={actionButton}

onClick={printInventory}

>

🖨 Print Report

</button>

<button
style={actionButton}
onClick={printInventoryThermal}
>
🖨 Thermal 80mm
</button>

<button

style={actionButton}

onClick={()=>setTableView(false)}

>

🪟 Cards

</button>

<button

style={actionButton}

onClick={()=>setTableView(true)}

>

📋 Table

</button>

<button

style={actionButton}

onClick={fetchItems}

>

🔄 Refresh

</button>

<button

style={actionButton}

onClick={printInventory}

>

🖨 Print

</button>

<button style={actionButton} onClick={printInventoryThermal}>🖨 Thermal 80mm</button>

</div>

      

     {/* PREMIUM INVENTORY FORM */}

<div style={formCard}>

<div style={formHeader}>

<div>

<h2 style={{margin:0}}>

{editingId ? "✏ Edit Inventory Item" : "➕ Add New Inventory"}

</h2>

<p style={formSub}>

Manage stock with professional inventory controls.

</p>

</div>

</div>

<h3 style={sectionTitle}>
📦 Inventory Information
</h3>

<div style={formGrid}>

       <input
  placeholder="Item Name"
  value={name}
  onChange={handleNameChange}
  style={input}
/>

<input
type="number"
placeholder="Quantity"
value={qty}
onChange={e=>setQty(e.target.value)}
style={input}
/>

<select

value={unit}

onChange={e=>setUnit(e.target.value)}

style={select}

>

<option>kg</option>

<option>ltr</option>

<option>pcs</option>

</select>

<select

value={category}

onChange={e=>setCategory(e.target.value)}

style={select}

>

<option>Vegetables</option>

<option>Dairy</option>

<option>Grocery</option>

<option>Meat</option>

<option>Drinks</option>

<option>Others</option>

</select>

<input

placeholder="Supplier"

value={supplier}

onChange={e=>setSupplier(e.target.value)}

style={input}

/>

<input

type="number"

placeholder="Minimum Stock"

value={minStock}

onChange={e=>setMinStock(e.target.value)}

style={input}

/>
<input
type="number"
placeholder="Cost Price"
value={costPrice}
onChange={e=>setCostPrice(e.target.value)}
style={input}
/>

<input
type="date"
value={expiryDate}
onChange={e=>setExpiryDate(e.target.value)}
style={input}
/>

<textarea
placeholder="Notes"
value={notes}
onChange={e=>setNotes(e.target.value)}
style={textarea}
/>

<button

onClick={addItem}

style={addBtn}

>

{editingId ? "Update Item" : "Add Item"}

</button>
</div>
<div style={formCard}>

  <h2 style={{marginBottom:20}}>
    🍳 Use Inventory
  </h2>

  <div style={formGrid}>

    <select
      value={useItem}
      onChange={e=>setUseItem(e.target.value)}
      style={select}
    >
      <option value="">Select Item</option>

      {items.map(item=>(
        <option
          key={item.id}
          value={item.id}
        >
          {item.name} ({item.quantity} {item.unit})
        </option>
      ))}

    </select>
    {selectedInventory && (

  <div
  style={{
    padding:15,
    borderRadius:12,
    background:
      selectedInventory.quantity <= selectedInventory.min_stock
      ? "var(--danger)"
      : "#14532d",
    color:"var(--text)",
    fontWeight:700
  }}
>
  Available :
  {selectedInventory.quantity}
  {" "}
  {selectedInventory.unit}

  <br/>

  Minimum :
  {selectedInventory.min_stock}
</div>
)}

    <input
  type="number"
  placeholder="Quantity to Use"
  value={useQty}
  onChange={e=>setUseQty(e.target.value)}
  style={input}
/>

<div
  style={{
    display:"flex",
    gap:10,
    flexWrap:"wrap"
  }}
>

  <button
    type="button"
    style={btnAdd}
    onClick={()=>setUseQty(1)}
  >
    1
  </button>

  <button
    type="button"
    style={btnAdd}
    onClick={()=>setUseQty(5)}
  >
    5
  </button>

  <button
    type="button"
    style={btnAdd}
    onClick={()=>setUseQty(10)}
  >
    10
  </button>

  <button
    type="button"
    style={btnAdd}
    onClick={()=>
      setUseQty(selectedInventory?.quantity || 0)
    }
  >
    All
  </button>

</div>

<select
  value={useReason}
  onChange={e=>setUseReason(e.target.value)}
  style={select}
>
      <option>Kitchen</option>
      <option>Order</option>
      <option>Waste</option>
      <option>Staff Meal</option>
      <option>Other</option>
    </select>

    <button
      onClick={useStock}
      style={deleteBtn}
    >
      Use Stock
    </button>

  </div>

</div>

      {loading && (

<div style={loadingCard}>

<div style={loader}></div>

Loading Inventory...

</div>

)}
      <div
style={toolbar}
>

<input

placeholder="🔍 Search Item / Supplier / SKU / Category"

value={search}

onChange={e=>setSearch(e.target.value)}

style={searchInput}

/>


<select

value={categoryFilter}

onChange={e=>setCategoryFilter(e.target.value)}

style={select}

>

<option value="all">

All Categories

</option>

<option>

Vegetables

</option>

<option>

Dairy

</option>

<option>

Meat

</option>

<option>

Drinks

</option>

<option>

Grocery

</option>

<option>

Others

</option>

</select>

<select

value={sortBy}

onChange={e=>setSortBy(e.target.value)}

style={select}

>

<option value="name">

Sort : Name

</option>

<option value="qty">

Sort : Quantity

</option>

<option value="category">

Sort : Category

</option>

</select>
<select
value={filter}
onChange={e=>setFilter(e.target.value)}
style={select}
>

<option value="all">All</option>
<option value="available">Available</option>
<option value="low">Low Stock</option>
<option value="out">Out Of Stock</option>

</select>
<button

style={viewBtn}

onClick={()=>setTableView(!tableView)}

>

{tableView

?"Card View"

:"Table View"}

</button>


</div>

</div>
<div style={analyticsWrapper}>

<div style={chartCard}>

<h2>📊 Stock Distribution</h2>

<div style={{height:300}}>

<ResponsiveContainer>

<PieChart>

<Pie

data={chartData}

dataKey="value"

nameKey="name"

outerRadius={90}

>

<Cell fill="var(--success)"/>

<Cell fill="var(--warning)"/>

<Cell fill="var(--danger)"/>

</Pie>

<Tooltip/>

</PieChart>

</ResponsiveContainer>

</div>

</div>

<div style={chartCard}>

<h2>📦 Category Distribution</h2>

<div style={{height:300}}>

<ResponsiveContainer>

<BarChart data={categoryData}>

<XAxis dataKey="name"/>

<YAxis/>

<Tooltip/>

<Bar

dataKey="count"

fill="var(--info)"

/>

</BarChart>

</ResponsiveContainer>

</div>

</div>

</div>


      {/* GRID */}
      {lowStock>0 && (

<div style={alertBox}>

⚠️ {lowStock} item(s) are running low on stock.

</div>

)}
{expiringItems.length>0 && (

<div style={expiryBox}>

⏰ {expiringItems.length} item(s) expire within 7 days.

</div>

)}

{outStock>0 && (

<div style={dangerBox}>

❌ {outStock} item(s) are out of stock.

</div>

)}
{showDetails && selectedItem && (

<div style={modalOverlay}>

<div style={modalCard}>

<h2>{selectedItem.name}</h2>

<p><b>Category:</b> {selectedItem.category}</p>

<p><b>Supplier:</b> {selectedItem.supplier || "--"}</p>

<p><b>Stock:</b> {selectedItem.quantity} {selectedItem.unit}</p>

<p><b>SKU:</b> {selectedItem.sku}</p>
<div
style={{
display:"flex",
gap:30,
marginTop:20,
alignItems:"center",
flexWrap:"wrap"
}}
>

<div>

<Barcode

value={selectedItem.sku || selectedItem.id.toString()}

width={1.5}

height={60}

/>

</div>

<div
style={{
background:"var(--text)",
padding:10,
borderRadius:10
}}
>

<QRCode

value={selectedItem.sku || selectedItem.id.toString()}

size={100}

/>

</div>

</div>

<p><b>Cost Price:</b> ₹{selectedItem.cost_price || 0}</p>




<p><b>Expiry:</b> {selectedItem.expiry_date || "--"}</p>

<p><b>Notes:</b> {selectedItem.notes || "--"}</p>

<button

style={deleteBtn}

onClick={()=>setShowDetails(false)}

>

Close

</button>

</div>

</div>

)}


{tableView ? (

<div style={tableWrapper}>

<table style={table}>

<thead>

<tr>

<th style={th}>Item</th>

<th style={th}>Category</th>

<th style={th}>Stock</th>

<th style={th}>Status</th>

<th style={th}>Action</th>

</tr>

</thead>

<tbody>

{filteredItems.length===0 ? (

<tr>

<td
colSpan={5}
style={{
padding:40,
textAlign:"center",
color:"var(--muted)"
}}
>

📦

<h2>No Inventory Found</h2>

<p>

Try changing filters or add a new item.

</p>

</td>

</tr>

) : (

filteredItems.map(item => (

<tr key={item.id}>

<td style={td}>{item.name}</td>

<td style={td}>{item.category||"-"}</td>

<td style={td}>

{item.quantity} {item.unit}

</td>

<td style={td}>

<span style={badge(item.quantity)}>

{item.quantity===0

?"Out of Stock"

:item.quantity<=(item.min_stock?? 0)

?"Low Stock"

:"In Stock"}

</span>

</td>

<td style={td}>

<div style={tableActions}>

<button

style={btnAdd}

onClick={()=>updateStock(item.id,1)}

>

+

</button>

<button

style={btnUse}

onClick={()=>updateStock(item.id,-1)}

>

-

</button>
<button

style={viewBtn}

onClick={()=>viewItem(item)}

>

👁 View

</button>


<button

style={editBtn}

onClick={()=>editItem(item)}

>

✏ Edit

</button>
<button

style={deleteBtn}

onClick={()=>deleteItem(item.id)}

>

🗑 Delete

</button>

</div>

</td>

</tr>

))

)}

</tbody>

</table>

</div>

) : (

filteredItems.length===0 ? (

<div style={emptyState}>

<div style={emptyIcon}>

📦

</div>

<h2>

Your inventory is empty

</h2>

<p>

Add vegetables, dairy, grocery, beverages or kitchen stock to get started.

</p>

</div>

) : (

<div style={grid}>
        {filteredItems.map(item => (
          <div key={item.id} style={card}>

            <div
style={{
display:"flex",
justifyContent:"space-between",
alignItems:"flex-start",
marginBottom:18
}}
>

<div>

<h3
style={{
margin:0,
fontSize:18,
fontWeight:700
}}
>

{item.name}

</h3>

<p
style={{
marginTop:6,
fontSize:13,
color:"var(--muted)"
}}
>

{item.category}

</p>

</div>

<div style={badge(item.quantity)}>

{item.quantity}

{item.unit}

</div>



              
            </div>

            <div style={line}></div>

<div
style={infoGrid}
>

<div>

<p style={label}>

Supplier

</p>

<b>

{item.supplier||"--"}

</b>

</div>

<div>

<p style={label}>

Expiry

</p>

<b>

{item.expiry_date||"--"}

</b>

</div>


</div>
<p style={label}>
Stock Level
</p>

<div style={progressBg}>
  <div
    style={{
      ...progressFill,
      width: `${Math.min(
        100,
        (item.quantity / ((item.min_stock ?? 0) * 2)) * 100
      )}%`
    }}
  />
</div>


<p
style={{
marginTop:8,
fontSize:12,
color:"var(--muted)"
}}
>

Minimum :

{item.min_stock}

{item.unit}

</p>

<div style={actions}>

<button

onClick={()=>editItem(item)}

style={editBtn}

>

✏ Edit

</button>
              <button onClick={()=>updateStock(item.id,1)} style={btnAdd}>+</button>
              <button onClick={()=>updateStock(item.id,-1)} style={btnUse}>-</button>
              <button
onClick={()=>viewItem(item)}
style={viewBtn}
>
👁 View
</button>
              <button
onClick={()=>deleteItem(item.id)}
style={deleteBtn}
>
🗑 Delete
</button>
            </div>

          </div>
                ))}
           </div>

)

)}
<div style={formCard}>

<h2 style={{marginBottom:20}}>
📜 Stock Usage History
</h2>

<div style={{overflowX:"auto"}}>

<table style={table}>

<thead>

<tr>

<th style={th}>Item</th>

<th style={th}>Used Qty</th>

<th style={th}>Unit</th>

<th style={th}>Reason</th>

<th style={th}>Date</th>

</tr>

</thead>

<tbody>

{usageHistory.length===0 ? (

<tr>

<td
colSpan={5}
style={td}
>

No Usage Found

</td>

</tr>

) : (

usageHistory.map(row=>(

<tr key={row.id}>

<td style={td}>
{row.item_name}
</td>

<td style={td}>
{row.used_qty}
</td>

<td style={td}>
{row.unit}
</td>

<td style={td}>
{row.reason}
</td>

<td style={td}>
{formatIndiaDateTime(row.created_at)}
</td>

</tr>

))

)}

</tbody>

</table>

</div>

</div>

<div style={footer}>

Restaurant Inventory Management

Powered by Anaira Graphics

© 2026

</div>

</div>
  )
}
  

/* 🎨 PREMIUM UI */

const layout = {
  minHeight: "100vh",
  padding: 30,
  background: "linear-gradient(180deg,var(--background),var(--surface-2))",
  color: "var(--text)"
}



/* 🔥 PANEL */


const input={

height:50,

padding:"0 16px",

borderRadius:14,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

fontSize:15,

outline:"none",

transition:".3s"

}

/* 🔥 FIXED SELECT */
const select={

height:50,

padding:"0 16px",

borderRadius:14,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

fontSize:15,

outline:"none",

cursor:"pointer"

}

const addBtn={

height:52,

padding:"0 30px",

border:"none",

borderRadius:14,

cursor:"pointer",

fontWeight:700,

fontSize:15,

background:

"linear-gradient(135deg,var(--success),var(--success))",

color:"var(--text)",

}
/* 🔥 GRID */
const grid={

display:"grid",

gridTemplateColumns:

"repeat(auto-fill,minmax(300px,1fr))",

gap:22

}

const card={

padding:20,

borderRadius:20,

background:

"linear-gradient(180deg,var(--surface),var(--surface-2))",

border:"1px solid rgba(255,255,255,.08)",

boxShadow:

"0 15px 35px rgba(0,0,0,.30)",

display:"flex",

flexDirection:"column",

transition:".25s",

minHeight:280

}



const badge=(q)=>({

padding:"6px 14px",

borderRadius:999,

fontWeight:700,

fontSize:13,

color:"var(--text)",

background:

q===0

?"var(--danger)"

:q<=5

?"var(--warning)"

:"var(--success)"

})

const line = {
  height: 1,
  background: "rgba(255,255,255,0.08)",
  margin: "10px 0"
}

const actions={

display:"grid",

gridTemplateColumns:

"repeat(5,1fr)",

gap:8,

marginTop:20

}
const actionButton = {
  height: 46,
  padding: "0 20px",
  minWidth: 150,

  background: "rgba(255,255,255,.02)",

  color: "var(--surface-2)",

  border: "1px solid rgba(236, 175, 7, 0.88)",

  borderRadius: 12,

  cursor: "pointer",

  fontSize: 14,

  fontWeight: 600,

  backdropFilter: "blur(18px)",

  WebkitBackdropFilter: "blur(18px)",

  transition: "all .25s",

  boxShadow: "0 8px 22px rgba(0,0,0,.18)"
}

const btnAdd={

padding:10,

border:"none",

borderRadius:10,

cursor:"pointer",

background:

"linear-gradient(135deg,var(--success),var(--success))",

color:"var(--text)",

fontWeight:700

}

const btnUse={

padding:10,

border:"none",

borderRadius:10,

cursor:"pointer",

background:

"linear-gradient(135deg,var(--danger),var(--danger))",

color:"var(--text)",

fontWeight:700

}
const statsGrid={

display:"grid",

gridTemplateColumns:
"repeat(auto-fit,minmax(200px,1fr))",

gap:18,

marginBottom:35

}

const toolbar = {

display:"grid",

gridTemplateColumns:"2fr repeat(4,1fr)",

gap:14,

padding:18,

marginBottom:25,

borderRadius:18,

background:"rgba(255,255,255,.03)",

border:"1px solid rgba(255,255,255,.08)",

backdropFilter:"blur(18px)"

}
const searchInput={

width:"100%",

height:52,

padding:"0 18px",

borderRadius:14,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

fontSize:15,

outline:"none"

}
const viewBtn={

padding:"12px 18px",

borderRadius:12,

border:"none",

cursor:"pointer",

fontWeight:700,

background:

"linear-gradient(135deg,var(--info),var(--info))",

color:"var(--text)"

}
const progressBg={

marginTop:12,

width:"100%",

height:10,

borderRadius:999,

overflow:"hidden",

background:"rgba(255,255,255,.08)"

}

const progressFill={

height:"100%",

borderRadius:999,

background:

"linear-gradient(90deg,var(--success),#84cc16)",

transition:".4s"

}
const editBtn={

padding:10,

border:"none",

borderRadius:10,

cursor:"pointer",

background:

"linear-gradient(135deg,var(--info),var(--info))",

color:"var(--text)",

fontWeight:700

}

const deleteBtn={

padding:10,

border:"none",

borderRadius:10,

cursor:"pointer",

background:

"linear-gradient(135deg,var(--danger),var(--danger))",

color:"var(--text)",

fontWeight:700

}
const alertBox={

padding:16,

marginBottom:20,

borderRadius:14,

background:"rgba(var(--warning-rgb),.15)",

border:"1px solid var(--warning)",

color:"color-mix(in srgb, var(--primary) 70%, white)",

fontWeight:700

}
const expiryBox={

padding:16,

marginBottom:20,

borderRadius:14,

background:"rgba(var(--info-rgb),.15)",

border:"1px solid var(--info)",

color:"#bfdbfe",

fontWeight:700

}

const dangerBox={

padding:16,

marginBottom:20,

borderRadius:14,

background:"rgba(var(--danger-rgb),.15)",

border:"1px solid var(--danger)",

color:"var(--danger)",

fontWeight:700

}
const tableWrapper={

overflowX:"auto",

borderRadius:22,

boxShadow:"0 20px 45px rgba(0,0,0,.35)",

marginBottom:25

}

const emptyState={

padding:"70px 30px",

textAlign:"center",

borderRadius:24,

background:"linear-gradient(145deg,var(--surface),var(--surface-2))",

border:"1px solid rgba(255,255,255,.08)"

}

const emptyIcon={

fontSize:70,

marginBottom:20

}

const table={

width:"100%",

borderCollapse:"collapse",

background:"rgba(255,255,255,.04)",

backdropFilter:"blur(18px)",

borderRadius:18,

overflow:"hidden"

}

const th={

padding:16,

textAlign:"left",

background:"var(--surface-2)",

borderBottom:"1px solid rgba(255,255,255,.08)"

}

const td={

padding:16,

borderBottom:"1px solid rgba(255,255,255,.06)"

}

const tableActions={

display:"flex",

gap:8,

flexWrap:"wrap"

}



const hero = {

display:"flex",

justifyContent:"space-between",

alignItems:"center",

padding:28,

marginBottom:28,

borderRadius:20,

background:"rgba(255,255,255,.03)",

border:"1px solid rgba(255,255,255,.08)",

backdropFilter:"blur(20px)",

boxShadow:"0 10px 30px rgba(0,0,0,.18)",

flexWrap:"wrap",

gap:20

}
const heroTitle = {
  margin: 0,

  fontSize: 52,

  fontWeight: 900,

  lineHeight: 1.1,

  letterSpacing: "-1px",

  background:
    "linear-gradient(90deg,var(--text),#f8d568,var(--text))",

  WebkitBackgroundClip: "text",

  WebkitTextFillColor: "transparent",

  textShadow: "0 0 40px rgba(255,215,0,.15)"
}
const heroSub = {
  maxWidth: 650,

  marginTop: 10,

  color: "var(--muted)",

  fontSize: 16,

  lineHeight: 1.8
}

const heroRight={

display:"flex",

gap:12,

alignItems:"center"

}

const liveBadge={

padding:"10px 16px",

borderRadius:999,

background:"var(--success)",

color:"var(--text)",

fontWeight:700

}

const dateCard={

padding:"10px 18px",

borderRadius:14,

background:"rgba(255,255,255,.06)",

border:"1px solid rgba(255,255,255,.08)"

}

const premiumCard = {

padding:20,

borderRadius:18,

minHeight:140,

background:"rgba(255,255,255,.03)",

border:"1px solid rgba(255,255,255,.08)",

backdropFilter:"blur(18px)",

display:"flex",

flexDirection:"column",

justifyContent:"center",

alignItems:"center",

boxShadow:"0 10px 28px rgba(0,0,0,.18)"

}
const iconCircle={

width:56,

height:56,

borderRadius:"50%",

display:"flex",

justifyContent:"center",

alignItems:"center",

fontSize:24,

marginBottom:15,

background:
"linear-gradient(135deg,var(--warning),var(--warning))",

color:"var(--text)"

}


const quickActions = {

display:"flex",

justifyContent:"center",

alignItems:"center",

flexWrap:"wrap",

gap:12,

marginBottom:25

}

const formCard = {

padding:26,

marginBottom:30,

borderRadius:20,

background:"rgba(255,255,255,.03)",

border:"1px solid rgba(255,255,255,.08)",

backdropFilter:"blur(18px)",

boxShadow:"0 10px 28px rgba(0,0,0,.18)"

}
const formHeader={

display:"flex",

justifyContent:"space-between",

alignItems:"center",

marginBottom:22

}

const formSub={

marginTop:8,

color:"var(--muted)"

}

const formGrid={

display:"grid",

gridTemplateColumns:

"repeat(auto-fit,minmax(230px,1fr))",

gap:16

}

const textarea={

minHeight:120,

padding:16,

borderRadius:16,

background:"var(--surface-2)",

border:"1px solid rgba(255,255,255,.08)",

color:"var(--text)",

fontSize:15,

resize:"vertical",

outline:"none"

}

const loadingCard={

display:"flex",

alignItems:"center",

gap:15,

padding:18,

marginBottom:20,

borderRadius:16,

background:"rgba(var(--info-rgb),.12)",

border:"1px solid rgba(var(--info-rgb),.25)"

}
const modalOverlay={

position:"fixed",

top:0,

left:0,

right:0,

bottom:0,

background:"rgba(0,0,0,.7)",

backdropFilter:"blur(10px)",

display:"flex",

justifyContent:"center",

alignItems:"center",

zIndex:9999

}

const modalCard={

width:"420px",

maxWidth:"95%",

padding:30,

borderRadius:24,

background:"linear-gradient(145deg,var(--surface),var(--surface-2))",

border:"1px solid rgba(255,255,255,.08)",

boxShadow:"0 30px 70px rgba(0,0,0,.45)",

color:"var(--text)"

}
const analyticsWrapper={

display:"grid",

gridTemplateColumns:

"2fr 1fr",

gap:25,

marginBottom:35

}
const chartCard={

padding:28,

borderRadius:24,

background:

"linear-gradient(180deg,var(--surface),var(--surface-2))",

border:"1px solid rgba(255,255,255,.08)",

boxShadow:

"0 15px 35px rgba(0,0,0,.30)"

}

if(typeof window!=="undefined"){

const style=document.createElement("style")

style.innerHTML=`

@media print{

button{

display:none!important;

}

body{

background:white!important;

color:black!important;

}

}

`

document.head.appendChild(style)

}
const footer={

marginTop:40,

padding:20,

textAlign:"center",

color:"var(--muted)",

fontSize:14,

borderTop:

"1px solid rgba(255,255,255,.08)"

}
const sectionTitle={

marginTop:20,

marginBottom:15,

fontSize:18,

fontWeight:700,

color:"var(--surface-2)"

}
const infoGrid={

display:"grid",

gridTemplateColumns:"1fr 1fr",

gap:15,

marginBottom:18

}

const label={

fontSize:12,

color:"var(--muted)",

marginBottom:5

}
const welcomeBadge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 18px",

  borderRadius: 999,

  background: "rgba(255,215,0,.08)",

  border: "1px solid rgba(255,215,0,.35)",

  color: "#FFD700",

  fontWeight: 700,

  fontSize: 13,

  letterSpacing: 1,

  textTransform: "uppercase",

  marginBottom: 18,

  backdropFilter: "blur(18px)"
}

const restaurantName = {
  marginTop: 12,

  marginBottom: 12,

  fontSize: 34,

  fontWeight: 800,

  color: "#FFD700",

  letterSpacing: ".5px"
}

const loader={

width:20,

height:20,

borderRadius:"50%",

border:"3px solid rgba(255,255,255,.2)",

borderTop:"3px solid var(--info)",

animation:"spin 1s linear infinite"

}
