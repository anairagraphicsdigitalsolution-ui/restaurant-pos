"use client"

import { useEffect, useRef } from "react"
import { Capacitor, registerPlugin } from "@capacitor/core"
import { supabaseCloud } from "@/lib/supabaseCloud"
import { makeEscPosReceipt, printBluetoothThermal, isBluetoothThermalConnected, restoreBluetoothThermalPrinter } from "@/lib/thermalPrintClient"
import { useAuth } from "@/components/AuthProvider"

const NativeBluetoothPrinter = registerPlugin("AnairaBluetoothPrinter")
const AGENT_KEY = "anaira-cloud-print-agent"

function bytesToBase64(bytes) {
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000))
  return btoa(binary)
}

export default function CloudPrintAgent() {
  const auth = useAuth()
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const nativeAndroid = Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === "android"
    const webBluetooth = !nativeAndroid && typeof navigator !== "undefined" && !!navigator.bluetooth
    if (!nativeAndroid && !webBluetooth) return () => { mounted.current = false }

    const run = async () => {
      if (busy.current || !mounted.current || !auth.restaurantId) return
      // On desktop web, never claim a cloud job unless this browser already
      // has a granted/connected BLE printer. Otherwise the job would be
      // claimed, fail, and look like the user still has to print manually.
      if (webBluetooth && !isBluetoothThermalConnected()) return
      busy.current = true
      try {
        const { data: session } = await supabaseCloud.auth.getSession()
        if (!session?.session?.user?.id) return
        const agentId = `${AGENT_KEY}:${session.session.user.id}`
        const { data: jobs, error } = await supabaseCloud.rpc("claim_next_print_job", {
          p_restaurant_id: auth.restaurantId,
          p_agent_id: agentId,
        })
        if (error || !jobs?.length) return
        const job = jobs[0]
        const payload = job.payload || {}
        const content = String(payload.content || "")
        const lines = content ? content.split("\n") : ["ANAIRA CLOUD PRINT", job.job_type || "PRINT JOB"]
        const bytes = makeEscPosReceipt({
          title: payload.title || `ANAIRA - ${String(job.job_type || "PRINT").toUpperCase()}`,
          lines,
          footer: payload.footer || "CLOUD PRINT",
        })
        try {
          if (nativeAndroid) {
            await NativeBluetoothPrinter.printRaw({ base64: bytesToBase64(bytes) })
          } else {
            if (!isBluetoothThermalConnected()) throw new Error("Bluetooth thermal printer is not connected")
            await printBluetoothThermal(bytes)
          }
          await supabaseCloud.from("print_jobs").update({ status: "printed", printed_at: new Date().toISOString(), last_error: null }).eq("id", job.id).eq("restaurant_id", auth.restaurantId)
          if (job.job_type === "kot" && job.reference_id) {
            await supabaseCloud.from("kot_tickets").update({ printed_at: new Date().toISOString() }).eq("restaurant_id", auth.restaurantId).eq("order_id", job.reference_id)
          }
          if (job.job_type === "delivery_slip" && job.payload?.delivery_id) {
            await supabaseCloud.from("restaurant_deliveries").update({ updated_at: new Date().toISOString() }).eq("restaurant_id", auth.restaurantId).eq("id", job.payload.delivery_id)
          }
        } catch (error) {
          await supabaseCloud.from("print_jobs").update({ status: Number(job.attempts || 0) >= 4 ? "failed" : "queued", attempts: Number(job.attempts || 0) + 1, last_error: String(error?.message || error) }).eq("id", job.id).eq("restaurant_id", auth.restaurantId)
        }
      } finally {
        busy.current = false
      }
    }

    let timer = null
    let channel = null
    let cancelled = false
    let wakeTimer = null
    const wake = () => {
      if (wakeTimer) window.clearTimeout(wakeTimer)
      wakeTimer = window.setTimeout(() => void run(), 150)
    }
    const init = async () => {
      if (webBluetooth) await restoreBluetoothThermalPrinter()
      if (cancelled) return
      void run()
      channel = supabaseCloud
        .channel(`restaurant-events-${auth.restaurantId}`)
        .on("broadcast", { event: "restaurant_print_job" }, (payload) => {
          if (String(payload?.payload?.restaurant_id || "") === String(auth.restaurantId)) wake()
        })
        .subscribe()
      timer = window.setInterval(() => void run(), 30000)
    }
    void init()
    return () => {
      cancelled = true; mounted.current = false
      if (timer) window.clearInterval(timer)
      if (wakeTimer) window.clearTimeout(wakeTimer)
      if (channel) void supabaseCloud.removeChannel(channel)
    }
  }, [auth.restaurantId])

  return null
}
