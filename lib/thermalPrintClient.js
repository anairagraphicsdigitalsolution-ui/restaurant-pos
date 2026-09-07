import { supabaseCloud } from "@/lib/supabaseCloud"
import { registerPlugin, Capacitor } from "@capacitor/core"

const NativeBluetoothPrinter = registerPlugin("AnairaBluetoothPrinter")
const LOCAL_BRIDGE = "http://127.0.0.1:3211"
const BLE_PROFILES = [
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", characteristic: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  { service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e", characteristic: "6e400002-b5a3-f393-e0a9-e50e24dcca9e" },
]
let bluetoothDevice = null
let bluetoothCharacteristic = null

const nativeAvailable = () => typeof window !== "undefined" && Capacitor?.isNativePlatform?.() === true
const webBluetoothAvailable = () => typeof navigator !== "undefined" && !!navigator.bluetooth
const isLocalBrowser = () => typeof window !== "undefined" && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)

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
    return { connected: response.ok && body?.success !== false, ...body }
  } catch (_) { return { connected: false } }
}

export async function startLocalPrintBridge() {
  if (!isLocalBrowser()) return { started: false, reason: "not-local-browser" }
  const current = await getLocalBridgeStatus()
  if (current.connected) return { started: true, alreadyRunning: true, ...current }
  try {
    const { response, body } = await fetchJson("/api/printing/local-bridge/start", { method: "POST" }, 6000)
    if (!response.ok) throw new Error(body?.error || "Unable to start Anaira Print Bridge")
  } catch (e) {
    return { started: false, error: e?.message || "Unable to start local print bridge" }
  }
  for (let i = 0; i < 8; i++) {
    await new Promise(r => setTimeout(r, 350))
    const status = await getLocalBridgeStatus()
    if (status.connected) return { started: true, ...status }
  }
  return { started: false, error: "Anaira Print Bridge did not start on 127.0.0.1:3211" }
}

export async function listLocalPrinters() {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/printers`, {}, 3000)
  if (!response.ok || !body?.success) throw new Error(body?.error || "Unable to detect Windows printer COM ports")
  return body.printers || []
}

export async function testLocalPrinter(port = null) {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  if (port) {
    const { response: connectResponse, body: connectBody } = await fetchJson(`${LOCAL_BRIDGE}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port, baud: 9600 }) }, 6000)
    if (!connectResponse.ok || !connectBody?.success) throw new Error(connectBody?.error || `Unable to connect ${port}`)
  }
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/test-print`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }, 8000)
  if (!response.ok || !body?.success) throw new Error(body?.error || "Local MPT-III test print failed")
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
    body: JSON.stringify({ type, content, data, base64: bytes ? btoa(binary) : null })
  }, 12000)
  if (!response.ok || !body?.success) throw new Error(body?.error || "Local thermal printer failed")
  return body
}

export async function connectLocalPrinter(port = null) {
  const started = await startLocalPrintBridge()
  if (!started.started) throw new Error(started.error || "Anaira Print Bridge is not running")
  const printers = await listLocalPrinters()
  if (!printers.length) throw new Error("No Windows Bluetooth/COM printer found. Pair MPT-III in Windows Bluetooth first.")
  const preferred = (port && printers.find(p => p.port === port)) || printers.find(p => /MPT|MTP|thermal|printer|pos|bluetooth/i.test(`${p.name || ""} ${p.description || ""}`)) || printers[0]
  const { response, body } = await fetchJson(`${LOCAL_BRIDGE}/connect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ port: preferred.port }) }, 6000)
  if (!response.ok || !body?.success) throw new Error(body?.error || `Unable to connect ${preferred.port}`)
  return body
}

export async function listNativeBluetoothPrinters() {
  if (!nativeAvailable()) return []
  try { const result = await NativeBluetoothPrinter.pairedPrinters(); return result?.printers || [] } catch (_) { return [] }
}

export async function connectNativeBluetoothThermalPrinter(address) {
  if (!nativeAvailable()) throw new Error("Native Bluetooth printer is only available inside the Anaira Android app.")
  const result = await NativeBluetoothPrinter.connect({ address })
  bluetoothDevice = { name: result?.name || "Bluetooth Thermal Printer", gatt: { connected: true } }
  bluetoothCharacteristic = { native: true }
  return { name: result?.name || "Bluetooth Thermal Printer", native: true }
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

export async function ensureThermalConnection() {
  if (nativeAvailable()) {
    if (isBluetoothThermalConnected()) return { transport: "android-bluetooth", connected: true }
    const paired = await listNativeBluetoothPrinters()
    if (!paired.length) throw new Error("No paired Bluetooth thermal printer found. Pair MPT-III in Android Bluetooth settings, then tap Connect Printer.")
    const preferred = paired.find(p => /MPT|MTP|thermal|printer|pos/i.test(p.name || "")) || paired[0]
    await connectNativeBluetoothThermalPrinter(preferred.address)
    return { transport: "android-bluetooth", connected: true, printer: preferred.name }
  }
  if (isLocalBrowser()) {
    try {
      const local = await startLocalPrintBridge()
      if (local.started) return { transport: "windows-bridge", connected: true, printer: local.printer || "MPT-III" }
    } catch (_) {}
  }
  if (isBluetoothThermalConnected()) return { transport: "web-bluetooth", connected: true }
  return { transport: "none", connected: false }
}

export async function sendThermalPrint({ type = "receipt", content = "", data = {}, escpos = null } = {}) {
  const bytes = escpos || makeEscPosReceipt({ title: type === "kot" ? "ANAIRA - KOT" : "ANAIRA", lines: String(content || "").split(/\r?\n/).filter(Boolean), footer: type === "kot" ? "KITCHEN COPY" : "THANK YOU" })

  if (isLocalBrowser()) {
    try { return await printLocalBridge({ bytes, type, content, data }) } catch (_) {}
  }
  if (nativeAvailable()) {
    try { await ensureThermalConnection(); if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes) } catch (_) {}
  }
  if (isBluetoothThermalConnected()) return printBluetoothThermal(bytes)

  const { data: sessionData } = await supabaseCloud.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error("Login session expired")
  const response = await fetch("/api/printing/print", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ printer_code: "thermal-printing", type, content, data }) })
  const result = await response.json().catch(() => ({}))
  if (response.ok && result?.success === true) return result
  throw new Error(result?.error || "Thermal print failed. Connect the local printer bridge or Bluetooth printer and try again.")
}
