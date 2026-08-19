import { supabaseAdmin } from "@/lib/supabaseServer"
import { requireApiUser } from "@/lib/serverAuth"

export const runtime = "nodejs"

function cleanQuery(value) {
  return String(value || "").trim().replace(/[%_(),]/g, " ").replace(/\s+/g, " ").slice(0, 80)
}

export async function GET(req) {
  try {
    const user = await requireApiUser(req)
    const q = cleanQuery(new URL(req.url).searchParams.get("q"))
    if (q.length < 2) return Response.json({ results: [] })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,role,restaurant_id")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError || !profile) return Response.json({ error: "Profile not found" }, { status: 403 })

    const isSuperAdmin = profile.role === "super_admin"
    const rid = profile.restaurant_id
    const like = `%${q}%`
    const results = []

    if (isSuperAdmin) {
      const { data } = await supabaseAdmin
        .from("restaurants")
        .select("id,name,address,phone,status")
        .or(`name.ilike.${like},address.ilike.${like},phone.ilike.${like},status.ilike.${like}`)
        .limit(20)
      ;(data || []).forEach(r => results.push({ id: r.id, type: "restaurant", title: r.name || "Restaurant", subtitle: r.phone || r.address || r.status || "", url: `/super-admin/restaurants?search=${encodeURIComponent(r.name || q)}` }))
      return Response.json({ results: results.slice(0, 30) })
    }

    if (!rid) return Response.json({ results: [] })

    const [menu, orders, customers, reservations, offers, tables, rooms, staff] = await Promise.all([
      supabaseAdmin.from("menu_items").select("id,name,category,description,item_type").eq("restaurant_id", rid).or(`name.ilike.${like},category.ilike.${like},description.ilike.${like}`).limit(20),
      supabaseAdmin.from("orders").select("id,source_label,invoice_no,status,total_amount,created_at").eq("restaurant_id", rid).or(`source_label.ilike.${like},invoice_no.ilike.${like},status.ilike.${like}`).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("customers").select("id,name,phone,email,total_orders").eq("restaurant_id", rid).or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(20),
      supabaseAdmin.from("reservations").select("id,name,phone,status,date,time").eq("restaurant_id", rid).or(`name.ilike.${like},phone.ilike.${like},status.ilike.${like}`).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("offers").select("id,title,description,discount,active").eq("restaurant_id", rid).or(`title.ilike.${like},description.ilike.${like}`).limit(20),
      supabaseAdmin.from("tables").select("id,table_number,seats").eq("restaurant_id", rid).limit(100),
      supabaseAdmin.from("rooms").select("id,room_number").eq("restaurant_id", rid).limit(100),
      supabaseAdmin.from("profiles").select("id,email,role").eq("restaurant_id", rid).or(`email.ilike.${like},role.ilike.${like}`).limit(20),
    ])

    ;(menu.data || []).forEach(x => results.push({ id: x.id, type: x.item_type === "combo" ? "combo" : "menu", title: x.name || "Menu item", subtitle: x.category || x.description || "", url: x.item_type === "combo" ? "/dashboard/combos" : "/order" }))
    ;(orders.data || []).forEach(x => results.push({ id: x.id, type: "order", title: x.invoice_no ? `Order ${x.invoice_no}` : `Order ${String(x.id).slice(0, 8)}`, subtitle: `${x.source_label || "Order"} • ₹${Number(x.total_amount || 0).toLocaleString("en-IN")} • ${x.status || "pending"}`, url: "/order" }))
    ;(customers.data || []).forEach(x => results.push({ id: x.id, type: "customer", title: x.name || "Customer", subtitle: x.phone || x.email || `${x.total_orders || 0} orders`, url: "/dashboard/customers" }))
    ;(reservations.data || []).forEach(x => results.push({ id: x.id, type: "reservation", title: x.name || "Reservation", subtitle: `${x.date || ""} ${x.time || ""} • ${x.status || "pending"}`, url: "/dashboard/reservations" }))
    ;(offers.data || []).forEach(x => results.push({ id: x.id, type: "offer", title: x.title || "Offer", subtitle: `${x.discount || 0}% ${x.active === false ? "• inactive" : "• active"}`, url: "/dashboard/offers" }))
    ;(tables.data || []).filter(x => String(x.table_number || "").toLowerCase().includes(q.toLowerCase())).forEach(x => results.push({ id: x.id, type: "table", title: `Table ${x.table_number}`, subtitle: `${x.seats || 0} seats`, url: "/dashboard/tables" }))
    ;(rooms.data || []).filter(x => String(x.room_number || "").toLowerCase().includes(q.toLowerCase())).forEach(x => results.push({ id: x.id, type: "room", title: `Room ${x.room_number}`, subtitle: "Room", url: "/dashboard/add-room" }))
    ;(staff.data || []).forEach(x => results.push({ id: x.id, type: "staff", title: x.email || "Staff", subtitle: x.role || "staff", url: "/dashboard/business" }))

    return Response.json({ results: results.slice(0, 50) })
  } catch (error) {
    console.error("GLOBAL SEARCH ERROR", error)
    return Response.json({ error: error.message || "Search failed" }, { status: 401 })
  }
}
