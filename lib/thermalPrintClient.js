import { supabaseCloud } from "@/lib/supabaseCloud"
import { enqueueCloudPrintJob } from "@/lib/cloudPrintQueue"
import { registerPlugin, Capacitor } from "@capacitor/core"

const NativeBluetoothPrinter = registerPlugin("AnairaBluetoothPrinter")
const LOCAL_BRIDGE = "http://127.0.0.1:3211"
const BLE_PROFILES = [
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "000018f0-0000-1000-8000-00805f9b34fb", characteristic: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "0000ae30-0000-1000-8000-00805f9b34fb", characteristic: "0000ae01-0000-1000-8000-00805f9b34fb" },
  { service: "0000ff00-0000-1000-8000-00805f9b34fb", characteristic: "0000ff02-0000-1000-8000-00805f9b34fb" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", characteristic: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", characteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" },
]
let bluetoothDevice = null
let bluetoothCharacteristic = null

const nativeAvailable = () => typeof window !== "undefined" && Capacitor?.isNativePlatform?.() === true
const webBluetoothAvailable = () => typeof navigator !== "undefined" && !!navigator.bluetooth
const isBrowser = () => typeof window !== "undefined"

export function isNativeBluetoothPrinterAvailable() { return nativeAvailable() }
export function isBluetoothThermalSupported() { return nativeAvailable() || webBluetoothAvailable() }
export function isBluetoothThermalConnected() { return !!bluetoothDevice?.gatt?.connected && !!bluetoothCharacteristic }
export function getBluetoothThermalName() { return bluetoothDevice?.name || "Bluetooth Thermal Printer" }

async function fetchJson(url, options = {}, timeoutMs = 1800) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    return { response, body }
  } finally { clearTimeout(timer) }
}

export async function getLocalBridgeStatus() {
  try {
    const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/health`)
    const running = response.ok && body?.success !== false && body?.ok !== false
    // /health means the bridge process is alive; it does not necessarily mean
    // a COM printer is currently selected/open. Keep these states separate.
    const connected = running && (body?.connected === true || !!body?.saved_port || !!body?.port)
    return { running, connected, ...body }
  } catch (_) { return { running: false, connected: false } }
}

export async function startLocalPrintBridge() {
  // Sofson-compatible behavior: the browser always talks to the Windows
  // machine's own 127.0.0.1 bridge. During local Windows development, we can
  // safely ask the local Next.js process to start that bridge. On a deployed
  // domain this route is intentionally NOT used because Vercel cannot start a
  // PowerShell process on the customer's PC; the Windows startup installer
  // remains the production mechanism.
  if (!isBrowser()) return { started: false, reason: "not-browser" }
  const current = await getLocalBridgeStatus()
  if (current.running) return { started: true, alreadyRunning: true, ...current }

  const hostname = window.location.hostname
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    try {
      const { response, body } = await fetchJson("/api/printing/local-bridge/start", { method: "POST" }, 7000)
      if (response.ok && (body?.success ?? body?.ok)) return { started: true, ...body }
    } catch {}
  }

  return { started: false, error: "Anaira Print Bridge is not running on this Windows PC. On localhost it can be started automatically; on the production domain, run the Anaira MPT-III setup once so the bridge starts with Windows." }
}

export async function listLocalPrinters() {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/printers`, {}, 3000)
  if (!response.ok || !(body?.success ?? body?.ok)) throw new Error(body?.error || "Unable to detect Windows printer COM ports")
  return body.printers || []
}

export async function testLocalPrinter(port = null) {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  if (port) {
    const { response: connectResponse, body: connectBody } = await fetchJson(`${LOCAL_BRIDGE}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port, baud: 9600 }) }, 6000)
    if (!connectResponse.ok || !(connectBody?.success ?? connectBody?.ok)) throw new Error(connectBody?.error || `Unable to connect ${port}`)
  }
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/test-print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, 8000)
  if (!response.ok || !(body?.success ?? body?.ok)) throw new Error(body?.error || "Local MPT-III test print failed")
  return body
}

export async function printLocalBridge({ bytes, type = "receipt", content = "", data = {} } = {}) {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  let binary = ""
  if (bytes) {
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  }
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/print-raw`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, content, data: bytes ? btoa(binary) : null })
  }, 12000)
  if (!response.ok || !(body?.success ?? body?.ok)) throw new Error(body?.error || "Local thermal printer failed")
  return body
}

export async function disconnectLocalPrinter() {
  try {
    const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/disconnect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 3000)
    if (!response.ok || !(body?.success ?? body?.ok)) throw new Error(body?.error || "Unable to disconnect local printer")
    return body
  } catch (e) {
    // If the bridge is already gone/disconnected, treat it as disconnected.
    return { success: true, disconnected: true, warning: e?.message || "Bridge unavailable" }
  }
}

export async function connectLocalPrinter(port = null) {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  const printers = await listLocalPrinters()
  if (!printers.length) throw new Error("No Windows Bluetooth/COM printer found. Pair MPT-III in Windows Bluetooth first.")
  const preferred = (port && printers.find(p => p.port === port)) || printers.find(p => /MPT|MTP|thermal|printer|pos|bluetooth/i.test(`${p.name || ""} ${p.description || ""}`)) || printers[0]
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: preferred.port }) }, 6000)
  if (!response.ok || !(body?.success ?? body?.ok)) throw new Error(body?.error || `Unable to connect ${preferred.port}`)
  return body
}

export async function listNativeBluetoothPrinters() {
  if (!nativeAvailable()) return []
  try {
    const result = await NativeBluetoothPrinter.scanBle()
    return result?.printers || []
  } catch (_) {
    try { const result = await NativeBluetoothPrinter.pairedPrinters(); return result?.printers || [] } catch (__) { return [] }
  }
}

export async function connectNativeBluetoothThermalPrinter(address, { ble = true } = {}) {
  if (!nativeAvailable()) throw new Error("Native Bluetooth printer is only available inside the Anaira Android app.")
  const result = ble
    ? await NativeBluetoothPrinter.connectBle({ address })
    : await NativeBluetoothPrinter.connect({ address })
  bluetoothDevice = { name: result?.name || "Bluetooth Thermal Printer", gatt: { connected: true } }
  bluetoothCharacteristic = { native: true, service: result?.service, characteristic: result?.characteristic }
  return { name: result?.name || "Bluetooth Thermal Printer", native: true, ble, service: result?.service, characteristic: result?.characteristic }
}

export async function disconnectNativeBluetoothThermalPrinter() {
  if (nativeAvailable()) { try { await NativeBluetoothPrinter.disconnect() } catch (_) {} }
  bluetoothDevice = null; bluetoothCharacteristic = null
}

export async function openNativeBluetoothSettings() {
  if (!nativeAvailable()) throw new Error("Android Bluetooth settings are only available in the Anaira app.")
  return NativeBluetoothPrinter.openBluetoothSettings()
}

async function resolveCharacteristic(server) {
  for (const profile of BLE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service)
      return await service.getCharacteristic(profile.characteristic)
    } catch (_) {}
  }
  throw new Error("Bluetooth printer service not supported. Use a BLE ESC/POS printer with FFE0/FFE1 or Nordic UART, or use the Anaira Windows local bridge for classic MPT-III Bluetooth.")
}

export async function restoreBluetoothThermalPrinter() {
  if (!webBluetoothAvailable() || typeof navigator.bluetooth.getDevices !== "function") return { restored: false }
  try {
    const devices = await navigator.bluetooth.getDevices()
    const device = devices.find(d => d && d.gatt)
    if (!device) return { restored: false }
    const server = device.gatt.connected ? device.gatt : await device.gatt.connect()
    const characteristic = await resolveCharacteristic(server)
    bluetoothDevice = device
    bluetoothCharacteristic = characteristic
    device.addEventListener("gattserverdisconnected", () => { bluetoothCharacteristic = null })
    return { restored: true, name: device.name || "Bluetooth Thermal Printer" }
  } catch (_) {
    bluetoothDevice = null
    bluetoothCharacteristic = null
    return { restored: false }
  }
}

export async function connectBluetoothThermalPrinter() {
  if (!webBluetoothAvailable()) throw new Error("Web Bluetooth is not supported in this browser. Use the Anaira Windows local bridge for classic MPT-III Bluetooth.")
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BLE_PROFILES.map(x => x.service) })
  const server = await device.gatt.connect()
  const characteristic = await resolveCharacteristic(server)
  bluetoothDevice = device; bluetoothCharacteristic = characteristic
  device.addEventListener("gattserverdisconnected", () => { bluetoothCharacteristic = null })
  return { name: device.name || "Bluetooth Thermal Printer" }
}

export function disconnectBluetoothThermalPrinter() {
  try { bluetoothDevice?.gatt?.disconnect() } catch (_) {}
  bluetoothDevice = null; bluetoothCharacteristic = null
}

function concat(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(size); let offset = 0
  parts.forEach(p => { out.set(p, offset); offset += p.length })
  return out
}
function escText(value) { return String(value ?? "").replace(/₹/g, "Rs.").replace(/[^\x00-\x7F]/g, "?") }
export function makeEscPosReceipt({ title = "ANAIRA", lines = [], footer = "" } = {}) {
  const enc = new TextEncoder(); const chunks = []
  chunks.push(new Uint8Array([0x1b,0x40]), new Uint8Array([0x1b,0x61,0x01]), new Uint8Array([0x1b,0x45,0x01]), enc.encode(escText(title)+"\n"), new Uint8Array([0x1b,0x45,0x00]), new Uint8Array([0x1b,0x61,0x00]))
  lines.forEach(line => chunks.push(enc.encode(escText(line)+"\n")))
  if (footer) chunks.push(enc.encode("\n"+escText(footer)+"\n"))
  chunks.push(enc.encode("\n\n"), new Uint8Array([0x1d,0x56,0x00]))
  return concat(chunks)
}


function padRight(value, width) {
  const text = escText(value)
  return text.length >= width ? text.slice(0, width) : text + " ".repeat(width - text.length)
}
function padLeft(value, width) {
  const text = escText(value)
  return text.length >= width ? text.slice(-width) : " ".repeat(width - text.length) + text
}
function receiptRow(label, value, width) {
  const left = escText(label)
  const right = escText(value)
  const gap = Math.max(1, width - left.length - right.length)
  return (left + " ".repeat(gap) + right).slice(0, width)
}
export function makeEscPosInvoice({ restaurant = {}, order = {}, items = [], subtotal = 0, discount = 0, gst = 0, deliveryCharge = 0, total = 0, paymentMethod = "", paidAmount = 0, customerName = "", customerPhone = "", offerName = "", invoiceNo = "", size = "80mm" } = {}) {
  const width = size === "58mm" ? 32 : 42
  const enc = new TextEncoder()
  const chunks = []
  const push = (text = "") => chunks.push(enc.encode(escText(text) + "\n"))
  const rule = () => push("-".repeat(width))
  chunks.push(new Uint8Array([0x1b,0x40]))
  chunks.push(new Uint8Array([0x1b,0x61,0x01]), new Uint8Array([0x1b,0x45,0x01]))
  push(restaurant.name || "ANAIRA")
  chunks.push(new Uint8Array([0x1b,0x45,0x00]))
  if (restaurant.address) push(restaurant.address)
  if (restaurant.phone) push(`Phone: ${restaurant.phone}`)
  if (restaurant.gst_number) push(`GSTIN: ${restaurant.gst_number}`)
  push("TAX INVOICE")
  chunks.push(new Uint8Array([0x1b,0x61,0x00]))
  rule()
  push(receiptRow("Invoice", invoiceNo || order.invoice_no || order.id || "-", width))
  if (order.created_at) push(receiptRow("Date", new Date(order.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }), width))
  if (order.order_type || order.type) push(receiptRow("Type", String(order.order_type || order.type).toUpperCase(), width))
  if (customerName) push(`Customer: ${customerName}`)
  if (customerPhone) push(`Mobile: ${customerPhone}`)
  rule()
  push(padRight("ITEM", Math.max(1, width - 10)) + padLeft("QTY", 4) + padLeft("AMT", 6))
  rule()
  for (const item of items) {
    const name = escText(item.name || item.item_name || "Item")
    const qty = Number(item.quantity || 0)
    const amount = Number(item.line_total || 0)
    const nameWidth = Math.max(1, width - 10)
    const nameLines = []
    for (let i = 0; i < name.length; i += nameWidth) nameLines.push(name.slice(i, i + nameWidth))
    push(padRight(nameLines[0] || "Item", nameWidth) + padLeft(qty.toString(), 4) + padLeft(amount.toFixed(2), 6))
    for (const extra of nameLines.slice(1)) push(extra)
    if (item.modifiers?.length) {
      for (const m of item.modifiers) push(`  + ${m.modifier_name || m.name || "Modifier"}`)
    }
    if (item.cooking_request) push(`  Note: ${item.cooking_request}`)
  }
  rule()
  push(receiptRow("Subtotal", `Rs.${Number(subtotal).toFixed(2)}`, width))
  if (offerName) push(`Offer: ${offerName}`)
  if (Number(discount) > 0) push(receiptRow("Discount", `-Rs.${Number(discount).toFixed(2)}`, width))
  if (Number(gst) > 0) push(receiptRow("GST", `Rs.${Number(gst).toFixed(2)}`, width))
  if (Number(deliveryCharge) > 0) push(receiptRow("Delivery Charge", `Rs.${Number(deliveryCharge).toFixed(2)}`, width))
  chunks.push(new Uint8Array([0x1b,0x45,0x01]))
  push(receiptRow("TOTAL", `Rs.${Number(total).toFixed(2)}`, width))
  chunks.push(new Uint8Array([0x1b,0x45,0x00]))
  if (paymentMethod) push(receiptRow("Payment", String(paymentMethod).toUpperCase(), width))
  push(receiptRow("Paid", `Rs.${Number(paidAmount).toFixed(2)}`, width))
  rule()
  chunks.push(new Uint8Array([0x1b,0x61,0x01]))
  push("Thank you for your visit!")
  push("Powered by Anaira Graphics")
  chunks.push(enc.encode("\n\n"), new Uint8Array([0x1d,0x56,0x00]))
  return concat(chunks)
}

export async function printBluetoothThermal(bytes) {
  if (bluetoothCharacteristic?.native) {
    let binary = ""; const chunk = 0x8000
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.slice(i, i + chunk))
    return NativeBluetoothPrinter.printRaw({ base64: btoa(binary) })
  }
  if (!isBluetoothThermalConnected()) throw new Error("Bluetooth thermal printer is not connected.")
  const maxChunk = bluetoothCharacteristic.properties?.writeWithoutResponse ? 180 : 20
  for (let i = 0; i < bytes.length; i += maxChunk) {
    const chunk = bytes.slice(i, i + maxChunk)
    if (bluetoothCharacteristic.properties?.writeWithoutResponse && bluetoothCharacteristic.writeValueWithoutResponse) await bluetoothCharacteristic.writeValueWithoutResponse(chunk)
    else await bluetoothCharacteristic.writeValue(chunk)
  }
  return { success: true, transport: "web-bluetooth", printer: getBluetoothThermalName() }
}

export async function autoConnectThermalPrinter() {
  if (nativeAvailable()) {
    return ensureThermalConnection()
  }
  const status = await getLocalBridgeStatus()
  if (status.connected) {
    const printers = await listLocalPrinters()
    const selected = status.saved_port || printers.find(p => /MPT|MTP|thermal|printer|pos|bluetooth/i.test(`${p.name || ""} ${p.description || ""}`))?.port || printers[0]?.port || null
    if (selected) {
      const result = await connectLocalPrinter(selected)
      return { transport: "windows-bridge", connected: true, printer: result.printer || selected, port: result.port || selected }
    }
  }
  return { transport: "none", connected: false }
}

export async function ensureThermalConnection() {
  if (nativeAvailable()) {
    if (isBluetoothThermalConnected()) return { transport: "android-bluetooth", connected: true }
    const paired = await listNativeBluetoothPrinters()
    if (!paired.length) throw new Error("No paired Bluetooth thermal printer found. Pair MPT-III in Android Bluetooth settings, then tap Connect Printer.")
    const preferred = paired.find(p => /MPT|MTP|thermal|printer|pos/i.test(p.name || "")) || paired[0]
    await connectNativeBluetoothThermalPrinter(preferred.address)
    return { transport: "android-bluetooth", connected: true, printer: preferred.name }
  }
  if (isBrowser()) {
    try {
      const local = await startLocalPrintBridge()
      if (local.started) return { transport: "windows-bridge", connected: true, printer: local.printer || "MPT-III" }
    } catch (_) {}
  }
  if (isBluetoothThermalConnected()) return { transport: "web-bluetooth", connected: true }
  return { transport: "none", connected: false }
}

export async function sendThermalPrint({ type = "receipt", content = "", data = {}, escpos = null } = {}) {
  const bytes = escpos || makeEscPosReceipt({
    title: type === "kot" ? "ANAIRA - KOT" : "ANAIRA",
    lines: String(content || "").split(/\r?\n/).filter(Boolean),
    footer: type === "kot" ? "KITCHEN COPY" : "THANK YOU"
  })

  // Direct local Bluetooth is preferred only when a native/web connection is
  // already active. No localhost bridge is contacted in cloud-first mode.
  if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)

  const { data: sessionData } = await supabaseCloud.auth.getSession()
  const restaurantId = sessionData?.session?.user ? data?.restaurant_id || null : null
  if (!restaurantId) {
    const token = sessionData?.session?.access_token
    if (!token) throw new Error("Login session expired")
    const response = await fetch("/api/printing/print", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ printer_code: "thermal-printing", type, content, data })
    })
    const result = await response.json().catch(() => ({}))
    if (response.ok && result?.success === true) return result
    throw new Error(result?.error || "Cloud thermal print queue failed")
  }

  const job = await enqueueCloudPrintJob({
    restaurantId,
    jobType: type,
    referenceId: data?.order_id || null,
    content,
    data: { ...data, escpos_base64: (() => { let binary = ""; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000)); return btoa(binary) })() }
  })
  return { success: true, queued: true, cloud: true, job_id: job.id, message: "Print job queued in Supabase." }
}
