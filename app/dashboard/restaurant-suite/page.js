"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const money = (v) =>
  `₹${Number(v || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`

const todayISO = () => {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function RestaurantSuite() {
  const [rid, setRid] = useState(null)
  const [tab, setTab] = useState("overview")
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

  const [orders, setOrders] = useState([])
  const [tokens, setTokens] = useState([])
  const [channels, setChannels] = useState([])
  const [recon, setRecon] = useState([])

  const [campaigns, setCampaigns] = useState([])
  const [captains, setCaptains] = useState([])
  const [items, setItems] = useState([])

  const [terminals, setTerminals] = useState([])
  const [settlements, setSettlements] = useState([])
  const [payouts, setPayouts] = useState([])

  const [calls, setCalls] = useState([])
  const [wallets, setWallets] = useState([])
  const [exports, setExports] = useState([])

  const [online, setOnline] = useState({
    channel_code: "swiggy",
    channel_name: "Swiggy",
    active: false,
  })

  const [settle, setSettle] = useState({
    rider_name: "",
    expected_cash: "",
    expected_upi: "",
    expected_card: "",
    submitted_cash: "",
    submitted_upi: "",
    submitted_card: "",
  })

  const [terminal, setTerminal] = useState({
    terminal_code: "",
    terminal_name: "",
    device_type: "pos",
  })

  const [call, setCall] = useState({
    token_no: "",
    display_name: "",
    message: "",
  })

  const [campaign, setCampaign] = useState({
    name: "",
    channel: "whatsapp",
    message: "",
  })

  useEffect(() => {
    init()
  }, [])

  useEffect(() => {
    if (!msg) return

    const timer = setTimeout(() => {
      setMsg("")
    }, 4000)

    return () => clearTimeout(timer)
  }, [msg])

  async function init() {
    try {
      setLoading(true)

      const { data: u, error: userError } =
        await supabase.auth.getUser()

      if (userError || !u?.user) {
        setLoading(false)
        return
      }

      const { data: p, error: profileError } =
        await supabase
          .from("profiles")
          .select("restaurant_id")
          .eq("id", u.user.id)
          .maybeSingle()

      if (profileError) {
        setMsg(profileError.message)
        setLoading(false)
        return
      }

      if (!p?.restaurant_id) {
        setMsg("Restaurant is not assigned to this account.")
        setLoading(false)
        return
      }

      setRid(p.restaurant_id)
      await load(p.restaurant_id)
    } catch (error) {
      setMsg(error?.message || "Unable to initialize Restaurant Suite.")
      setLoading(false)
    }
  }

  async function load(r = rid) {
    if (!r) return

    setLoading(true)

    try {
      const today = todayISO()

      const results = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id,source_label,order_mode,status,total_amount,payment_status,created_at"
          )
          .eq("restaurant_id", r)
          .order("created_at", { ascending: false })
          .limit(200),

        supabase
          .from("order_tokens")
          .select("*")
          .eq("restaurant_id", r)
          .eq("token_date", today)
          .order("token_no"),

        supabase
          .from("online_channels")
          .select("*")
          .eq("restaurant_id", r)
          .order("channel_name"),

        supabase
          .from("online_order_reconciliations")
          .select("*")
          .eq("restaurant_id", r)
          .order("order_date", { ascending: false })
          .limit(100),

        supabase
          .from("marketing_campaigns")
          .select("*")
          .eq("restaurant_id", r)
          .order("created_at", { ascending: false })
          .limit(50),

        supabase
          .from("captain_sessions")
          .select("*")
          .eq("restaurant_id", r)
          .order("last_seen_at", { ascending: false }),

        supabase
          .from("menu_items")
          .select("id,name,price")
          .eq("restaurant_id", r)
          .order("name"),

        supabase
          .from("pos_terminals")
          .select("*")
          .eq("restaurant_id", r)
          .order("terminal_name"),

        supabase
          .from("delivery_settlements")
          .select("*")
          .eq("restaurant_id", r)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("aggregator_payouts")
          .select("*")
          .eq("restaurant_id", r)
          .order("payout_date", { ascending: false })
          .limit(100),

        supabase
          .from("digital_display_calls")
          .select("*")
          .eq("restaurant_id", r)
          .order("created_at", { ascending: false })
          .limit(50),

        supabase
          .from("customer_wallets")
          .select("*")
          .eq("restaurant_id", r)
          .order("updated_at", { ascending: false })
          .limit(100),

        supabase
          .from("report_exports")
          .select("*")
          .eq("restaurant_id", r)
          .order("created_at", { ascending: false })
          .limit(50),
      ])

      const [
        ordersResult,
        tokensResult,
        channelsResult,
        reconResult,
        campaignsResult,
        captainsResult,
        itemsResult,
        terminalsResult,
        settlementsResult,
        payoutsResult,
        callsResult,
        walletsResult,
        exportsResult,
      ] = results

      setOrders(ordersResult.data || [])
      setTokens(tokensResult.data || [])
      setChannels(channelsResult.data || [])
      setRecon(reconResult.data || [])

      setCampaigns(campaignsResult.data || [])
      setCaptains(captainsResult.data || [])
      setItems(itemsResult.data || [])

      setTerminals(terminalsResult.data || [])

      setSettlements(settlementsResult.data || [])
      setPayouts(payoutsResult.data || [])
      setCalls(callsResult.data || [])
      setWallets(walletsResult.data || [])
      setExports(exportsResult.data || [])

      if (channelsResult.data?.length) {
        const firstChannel = channelsResult.data[0]

        setOnline({
          channel_code: firstChannel.channel_code || "swiggy",
          channel_name:
            firstChannel.channel_name || "Swiggy",
          active: Boolean(firstChannel.active),
        })
      }
    } catch (error) {
      setMsg(error?.message || "Unable to load Restaurant Suite.")
    } finally {
      setLoading(false)
    }
  }

  async function patchToken(id, status) {
    if (!rid || !id) return

    const patch = { status }

    if (status === "ready") {
      patch.ready_at = new Date().toISOString()
    }

    if (status === "picked_up") {
      patch.picked_up_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from("order_tokens")
      .update(patch)
      .eq("id", id)
      .eq("restaurant_id", rid)

    setMsg(error?.message || "Token updated successfully.")

    if (!error) {
      await load()
    }
  }

  async function saveChannel(e) {
    e.preventDefault()

    if (!rid) return

    const { error } = await supabase
      .from("online_channels")
      .upsert(
        {
          ...online,
          restaurant_id: rid,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "restaurant_id,channel_code",
        }
      )

    setMsg(error?.message || "Channel saved successfully.")

    if (!error) {
      await load()
    }
  }

  async function saveSettlement(e) {
    e.preventDefault()

    if (!rid) return

    const ec = Number(settle.expected_cash || 0)
    const eu = Number(settle.expected_upi || 0)
    const ed = Number(settle.expected_card || 0)

    const sc = Number(settle.submitted_cash || 0)
    const su = Number(settle.submitted_upi || 0)
    const sd = Number(settle.submitted_card || 0)

    const expectedTotal = ec + eu + ed
    const submittedTotal = sc + su + sd
    const diff = submittedTotal - expectedTotal

    const numericSettlement = {
      expected_cash: ec,
      expected_upi: eu,
      expected_card: ed,
      submitted_cash: sc,
      submitted_upi: su,
      submitted_card: sd,
    }

    const { error } = await supabase
      .from("delivery_settlements")
      .insert({
        restaurant_id: rid,
        rider_name: settle.rider_name.trim(),
        ...numericSettlement,
        difference: diff,
        status:
          Math.abs(diff) < 0.01
            ? "settled"
            : "short_or_excess",
        settled_at: new Date().toISOString(),
      })

    setMsg(
      error?.message ||
        `Settlement saved • Difference ${money(diff)}`
    )

    if (!error) {
      setSettle({
        rider_name: "",
        expected_cash: "",
        expected_upi: "",
        expected_card: "",
        submitted_cash: "",
        submitted_upi: "",
        submitted_card: "",
      })

      await load()
    }
  }

  async function saveTerminal(e) {
    e.preventDefault()

    if (!rid) return

    const { error } = await supabase
      .from("pos_terminals")
      .insert({
        ...terminal,
        restaurant_id: rid,
      })

    setMsg(error?.message || "Terminal registered successfully.")

    if (!error) {
      setTerminal({
        terminal_code: "",
        terminal_name: "",
        device_type: "pos",
      })

      await load()
    }
  }

  async function saveCall(e) {
    e.preventDefault()

    if (!rid) return

    const { error } = await supabase
      .from("digital_display_calls")
      .insert({
        ...call,
        restaurant_id: rid,
      })

    setMsg(error?.message || "Display call queued successfully.")

    if (!error) {
      setCall({
        token_no: "",
        display_name: "",
        message: "",
      })

      await load()
    }
  }

  async function saveCampaign(e) {
    e.preventDefault()

    if (!rid) return

    const { data: u } = await supabase.auth.getUser()

    const { error } = await supabase
      .from("marketing_campaigns")
      .insert({
        restaurant_id: rid,
        ...campaign,
        created_by: u?.user?.id || null,
        status: "draft",
      })

    setMsg(error?.message || "Campaign saved successfully.")

    if (!error) {
      setCampaign({
        name: "",
        channel: "whatsapp",
        message: "",
      })

      await load()
    }
  }

  async function requestExport(type) {
    if (!rid) return

    const { data: u } = await supabase.auth.getUser()

    const { error } = await supabase
      .from("report_exports")
      .insert({
        restaurant_id: rid,
        report_type: type,
        format: "csv",
        requested_by: u?.user?.id || null,
        status: "requested",
      })

    setMsg(error?.message || "Report export requested.")

    if (!error) {
      await load()
    }
  }

  const stats = useMemo(() => {
    const valid = orders.filter((o) => {
      const status = String(o.status || "").toLowerCase()

      return ![
        "cancelled",
        "canceled",
        "void",
        "voided",
        "refunded",
      ].includes(status)
    })

    const today = todayISO()

    const todayOrders = valid.filter(
      (o) =>
        String(o.created_at || "").slice(0, 10) === today
    )

    return {
      sales: todayOrders.reduce(
        (s, o) => s + Number(o.total_amount || 0),
        0
      ),

      orders: todayOrders.length,

      takeaway: todayOrders.filter(
        (o) =>
          String(o.order_mode || "").toLowerCase() ===
          "takeaway"
      ).length,

      delivery: todayOrders.filter(
        (o) =>
          String(o.order_mode || "").toLowerCase() ===
          "delivery"
      ).length,

      averageBill:
        todayOrders.length > 0
          ? todayOrders.reduce(
              (s, o) =>
                s + Number(o.total_amount || 0),
              0
            ) / todayOrders.length
          : 0,
    }
  }, [orders])

  const readyTokens = useMemo(
    () =>
      tokens.filter(
        (x) =>
          String(x.status || "").toLowerCase() ===
          "ready"
      ).length,
    [tokens]
  )

  const activeChannels = useMemo(
    () =>
      channels.filter(
        (x) => Boolean(x.active)
      ).length,
    [channels]
  )

  const activeTerminals = useMemo(
    () =>
      terminals.filter(
        (x) => Boolean(x.active)
      ).length,
    [terminals]
  )

  const tabs = [
    ["overview", "Overview"],
    ["tokens", "Tokens / Pickup"],
    ["delivery", "Rider Settlement"],
    ["online", "Online / Aggregators"],
    ["inventory", "Inventory / Food Cost"],
    ["crm", "CRM / Loyalty"],
    ["staff", "Captain / Staff"],
    ["terminals", "POS Terminals"],
    ["devices", "Kiosk / Display"],
    ["reports", "Reports"],
  ]

  return (
    <main className="suite">
      <section className="hero">
        <div>
          <div className="eyebrow">
            ANAIRA • RESTAURANT OPERATIONS
          </div>

          <h1>Complete Restaurant Control Center</h1>

          <p>
            Dine-in, takeaway, delivery, KOT, tokens,
            riders, aggregators, inventory, CRM, staff,
            terminals, kiosk, display and reports.
          </p>
        </div>

        <button
          type="button"
          onClick={() => load()}
          className="refresh"
        >
          ↻ Refresh
        </button>
      </section>

      <nav className="tabs">
        {tabs.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {msg && <div className="message">{msg}</div>}

      {tab === "overview" && (
        <>
          <section className="stats">
            <Stat
              label="Today's Sales"
              value={money(stats.sales)}
            />

            <Stat
              label="Today's Orders"
              value={stats.orders}
            />

            <Stat
              label="Takeaway"
              value={stats.takeaway}
            />

            <Stat
              label="Delivery"
              value={stats.delivery}
            />

            <Stat
              label="Ready Tokens"
              value={readyTokens}
            />

            <Stat
              label="Active Channels"
              value={activeChannels}
            />
          </section>

          <section className="stats secondaryStats">
            <Stat
              label="Average Bill"
              value={money(stats.averageBill)}
            />

            <Stat
              label="Settlements"
              value={settlements.length}
            />

            <Stat
              label="POS Terminals"
              value={activeTerminals}
            />

            <Stat
              label="Menu Items"
              value={items.length}
            />

            <Stat
              label="Campaigns"
              value={campaigns.length}
            />

            <Stat
              label="Payouts"
              value={payouts.length}
            />
          </section>

          <Panel title="End-to-end restaurant workflow">
            <div className="flow">
              {[
                "Dine-in / Quick Order",
                "Takeaway Token",
                "Delivery Slip",
                "KOT",
                "KDS",
                "Ready",
                "Pickup / Rider",
                "Payment",
                "Settlement",
                "Inventory Consumption",
                "CRM / Loyalty",
                "Reports",
              ].map((x, i) => (
                <span key={x}>
                  {i + 1}. {x}
                </span>
              ))}
            </div>
          </Panel>
        </>
      )}

      {tab === "tokens" && (
        <Panel title="Today's Takeaway / Delivery Tokens">
          <div className="tokenGrid">
            {tokens.length ? (
              tokens.map((t) => (
                <div
                  className={`token ${String(
                    t.status || ""
                  ).toLowerCase()}`}
                  key={t.id}
                >
                  <div className="tokenNo">
                    #{t.token_no}
                  </div>

                  <b>
                    {String(
                      t.token_type || "pickup"
                    ).toUpperCase()}
                  </b>

                  <small>
                    {t.pickup_name || "Customer"}
                  </small>

                  <strong>
                    {String(
                      t.status || "pending"
                    ).replaceAll("_", " ")}
                  </strong>

                  <div className="actions">
                    <button
                      type="button"
                      onClick={() =>
                        patchToken(t.id, "ready")
                      }
                    >
                      READY
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        patchToken(
                          t.id,
                          "picked_up"
                        )
                      }
                    >
                      PICKED UP
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <Empty text="No tokens today." />
            )}
          </div>
        </Panel>
      )}

      {tab === "delivery" && (
        <section className="grid">
          <Panel title="Rider Settlement">
            <form
              className="form"
              onSubmit={saveSettlement}
            >
              <input
                value={settle.rider_name}
                onChange={(e) =>
                  setSettle({
                    ...settle,
                    rider_name: e.target.value,
                  })
                }
                placeholder="Rider name"
                required
              />

              {[
                "expected_cash",
                "expected_upi",
                "expected_card",
                "submitted_cash",
                "submitted_upi",
                "submitted_card",
              ].map((k) => (
                <input
                  key={k}
                  type="number"
                  min="0"
                  step="0.01"
                  value={settle[k]}
                  onChange={(e) =>
                    setSettle({
                      ...settle,
                      [k]: e.target.value,
                    })
                  }
                  placeholder={k.replaceAll(
                    "_",
                    " "
                  )}
                />
              ))}

              <button type="submit">
                Settle Rider
              </button>
            </form>

            {settlements.length ? (
              settlements.map((s) => (
                <div className="row" key={s.id}>
                  <b>
                    {s.rider_name || "Rider"}
                  </b>

                  <span>
                    {s.status} • Difference{" "}
                    {money(s.difference)}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No rider settlements yet." />
            )}
          </Panel>

          <Panel title="Delivery operational links">
            <a
              className="link"
              href="/dashboard/delivery"
            >
              Open Delivery Management →
            </a>

            <a
              className="link"
              href="/order"
            >
              Create Delivery Order →
            </a>
          </Panel>
        </section>
      )}

      {tab === "online" && (
        <section className="grid">
          <Panel title="Aggregator Channels">
            <form
              className="form"
              onSubmit={saveChannel}
            >
              <select
                value={online.channel_code}
                onChange={(e) => {
                  const code = e.target.value

                  const names = {
                    swiggy: "Swiggy",
                    zomato: "Zomato",
                    website: "Website",
                    qr: "QR",
                  }

                  setOnline({
                    ...online,
                    channel_code: code,
                    channel_name:
                      names[code] || code,
                  })
                }}
              >
                <option value="swiggy">
                  Swiggy
                </option>

                <option value="zomato">
                  Zomato
                </option>

                <option value="website">
                  Website
                </option>

                <option value="qr">
                  QR
                </option>
              </select>

              <input
                value={online.channel_name}
                onChange={(e) =>
                  setOnline({
                    ...online,
                    channel_name:
                      e.target.value,
                  })
                }
                placeholder="Channel name"
              />

              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={online.active}
                  onChange={(e) =>
                    setOnline({
                      ...online,
                      active:
                        e.target.checked,
                    })
                  }
                />

                <span>Active</span>
              </label>

              <button type="submit">
                Save Channel
              </button>
            </form>

            {channels.length ? (
              channels.map((c) => (
                <div className="row" key={c.id}>
                  <b>{c.channel_name}</b>

                  <span
                    className={
                      c.active
                        ? "status activeStatus"
                        : "status"
                    }
                  >
                    {c.active ? "ACTIVE" : "OFF"}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No aggregator channels configured." />
            )}
          </Panel>

          <Panel title="Reconciliation">
            <div className="row">
              <b>Pending rows</b>

              <span>
                {
                  recon.filter(
                    (r) =>
                      String(
                        r.settlement_status || ""
                      ).toLowerCase() ===
                      "pending"
                  ).length
                }
              </span>
            </div>

            {payouts.length ? (
              payouts.map((p) => (
                <div className="row" key={p.id}>
                  <b>
                    {p.channel_code || "Aggregator"}{" "}
                    •{" "}
                    {p.payout_reference ||
                      "Payout"}
                  </b>

                  <span>
                    {money(p.net_payout)} •{" "}
                    {p.status || "pending"}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No aggregator payouts yet." />
            )}
          </Panel>
        </section>
      )}

      {tab === "inventory" && (
        <section className="grid">
          <Panel title="Inventory / Recipe">
            <p className="muted">
              Existing Recipe/BOM and inventory remain
              intact. Terminal sale triggers recipe
              consumption through the existing automation.
            </p>

            <a
              className="link"
              href="/dashboard/inventory"
            >
              Open Inventory →
            </a>

            <a
              className="link"
              href="/dashboard/restaurant-pro"
            >
              Open Restaurant Pro →
            </a>
          </Panel>

          <Panel title="Food Cost">
            <p className="muted">
              Use the existing food-cost calculator,
              recipe/BOM and menu prices to monitor
              margin.
            </p>

            <div className="miniStats">
              <div>
                <span>Menu Items</span>
                <strong>{items.length}</strong>
              </div>

              <div>
                <span>Inventory Link</span>
                <strong>Connected</strong>
              </div>
            </div>

            <a
              className="link"
              href="/dashboard/restaurant-suite"
            >
              Refresh cost data →
            </a>
          </Panel>
        </section>
      )}

      {tab === "crm" && (
        <section className="grid">
          <Panel title="CRM Campaigns">
            <form
              className="form"
              onSubmit={saveCampaign}
            >
              <input
                value={campaign.name}
                onChange={(e) =>
                  setCampaign({
                    ...campaign,
                    name: e.target.value,
                  })
                }
                placeholder="Campaign name"
                required
              />

              <select
                value={campaign.channel}
                onChange={(e) =>
                  setCampaign({
                    ...campaign,
                    channel: e.target.value,
                  })
                }
              >
                <option value="whatsapp">
                  WhatsApp
                </option>

                <option value="sms">
                  SMS
                </option>

                <option value="email">
                  Email
                </option>
              </select>

              <textarea
                rows={4}
                value={campaign.message}
                onChange={(e) =>
                  setCampaign({
                    ...campaign,
                    message: e.target.value,
                  })
                }
                placeholder="Message"
                required
              />

              <button type="submit">
                Save Draft
              </button>
            </form>

            {campaigns.length ? (
              campaigns.map((c) => (
                <div className="row" key={c.id}>
                  <b>{c.name}</b>

                  <span>
                    {c.channel} • {c.status}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No campaigns yet." />
            )}
          </Panel>

          <Panel title="Loyalty Wallet">
            <p className="muted">
              Customer wallet and points ledger remain
              connected to the existing restaurant scope.
            </p>

            {wallets.length ? (
              wallets.map((w) => (
                <div className="row" key={w.id}>
                  <b>
                    Customer{" "}
                    {String(
                      w.customer_id || ""
                    ).slice(0, 8)}
                  </b>

                  <span>
                    {money(w.balance)} •{" "}
                    {Number(w.points || 0)} points
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No loyalty wallets found." />
            )}
          </Panel>
        </section>
      )}

      {tab === "staff" && (
        <Panel title="Captain / Staff">
          <p className="muted">
            Captain sessions are device-aware and
            restaurant-scoped.
          </p>

          {captains.length ? (
            captains.map((c) => (
              <div className="row" key={c.id}>
                <b>
                  {c.staff_name || "Staff"}
                </b>

                <span>
                  {c.device_name || "Device"} •{" "}
                  {c.last_seen_at
                    ? new Date(
                        c.last_seen_at
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "No activity"}
                </span>
              </div>
            ))
          ) : (
            <Empty text="No active captain sessions." />
          )}
        </Panel>
      )}

      {tab === "terminals" && (
        <Panel title="Multi-terminal POS">
          <form
            className="form"
            onSubmit={saveTerminal}
          >
            <input
              value={terminal.terminal_code}
              onChange={(e) =>
                setTerminal({
                  ...terminal,
                  terminal_code:
                    e.target.value,
                })
              }
              placeholder="Terminal code"
              required
            />

            <input
              value={terminal.terminal_name}
              onChange={(e) =>
                setTerminal({
                  ...terminal,
                  terminal_name:
                    e.target.value,
                })
              }
              placeholder="Terminal name"
              required
            />

            <select
              value={terminal.device_type}
              onChange={(e) =>
                setTerminal({
                  ...terminal,
                  device_type:
                    e.target.value,
                })
              }
            >
              <option value="pos">POS</option>
              <option value="kitchen">
                Kitchen
              </option>
              <option value="billing">
                Billing
              </option>
              <option value="captain">
                Captain
              </option>
            </select>

            <button type="submit">
              Register Terminal
            </button>
          </form>

          {terminals.length ? (
            terminals.map((t) => (
              <div className="row" key={t.id}>
                <b>
                  {t.terminal_name ||
                    "Unnamed Terminal"}
                </b>

                <span>
                  {t.terminal_code || "No code"} •{" "}
                  {t.active ? "ACTIVE" : "OFF"}
                </span>
              </div>
            ))
          ) : (
            <Empty text="No POS terminals registered." />
          )}
        </Panel>
      )}

      {tab === "devices" && (
        <section className="grid">
          <Panel title="Digital Display / Calling">
            <form
              className="form"
              onSubmit={saveCall}
            >
              <input
                value={call.token_no}
                onChange={(e) =>
                  setCall({
                    ...call,
                    token_no:
                      e.target.value,
                  })
                }
                placeholder="Token"
                required
              />

              <input
                value={call.display_name}
                onChange={(e) =>
                  setCall({
                    ...call,
                    display_name:
                      e.target.value,
                  })
                }
                placeholder="Customer / display name"
              />

              <input
                value={call.message}
                onChange={(e) =>
                  setCall({
                    ...call,
                    message:
                      e.target.value,
                  })
                }
                placeholder="Message"
              />

              <button type="submit">
                Call Token
              </button>
            </form>

            {calls.length ? (
              calls.map((c) => (
                <div className="row" key={c.id}>
                  <b>
                    #{c.token_no}{" "}
                    {c.display_name}
                  </b>

                  <span>
                    {c.status || "queued"}
                  </span>
                </div>
              ))
            ) : (
              <Empty text="No display calls yet." />
            )}
          </Panel>

          <Panel title="Kiosk / Customer Ordering">
            <a
              className="link"
              href="/order"
            >
              Open Customer POS →
            </a>

            <a
              className="link"
              href="/kitchen"
            >
              Open KDS →
            </a>

            <a
              className="link"
              href="/dashboard/qr"
            >
              Open QR Center →
            </a>
          </Panel>
        </section>
      )}

      {tab === "reports" && (
        <Panel title="Reports & Exports">
          <div className="reportGrid">
            {[
              "sales",
              "orders",
              "payments",
              "inventory",
              "food_cost",
              "online_reconciliation",
              "staff",
              "customers",
              "delivery_settlement",
              "tax",
            ].map((x) => (
              <button
                type="button"
                key={x}
                onClick={() =>
                  requestExport(x)
                }
              >
                {x.replaceAll("_", " ")} → CSV
              </button>
            ))}
          </div>

          {exports.length ? (
            exports.map((x) => (
              <div className="row" key={x.id}>
                <b>{x.report_type}</b>

                <span>
                  {x.status} •{" "}
                  {x.created_at
                    ? new Date(
                        x.created_at
                      ).toLocaleString(
                        "en-IN"
                      )
                    : "—"}
                </span>
              </div>
            ))
          ) : (
            <Empty text="No report exports requested." />
          )}
        </Panel>
      )}

      {loading && (
        <div className="loading">
          <span className="loader" />
          Loading Restaurant Suite…
        </div>
      )}

      <style jsx>{`
        /*
          ============================================================
          RESTAURANT SUITE THEME SYSTEM
          ============================================================

          This page now inherits the project's global theme variables.

          Supported variables:
          --background
          --foreground
          --card
          --card-foreground
          --primary
          --primary-foreground
          --secondary
          --secondary-foreground
          --accent
          --accent-foreground
          --muted
          --muted-foreground
          --border

          If the project has not defined them, the fallback values
          below keep the existing dark green/gold appearance.
        */

        .suite {
          --suite-bg: var(
            --background,
            #020617
          );

          --suite-fg: var(
            --foreground,
            #f8fafc
          );

          --suite-card: var(
            --card,
            #0f241b
          );

          --suite-card-fg: var(
            --card-foreground,
            #f8fafc
          );

          --suite-primary: var(
            --primary,
            #d4a72c
          );

          --suite-primary-fg: var(
            --primary-foreground,
            #07110a
          );

          --suite-secondary: var(
            --secondary,
            #17251f
          );

          --suite-secondary-fg: var(
            --secondary-foreground,
            #f8fafc
          );

          --suite-accent: var(
            --accent,
            #1c3328
          );

          --suite-accent-fg: var(
            --accent-foreground,
            #f8fafc
          );

          --suite-muted: var(
            --muted,
            #13231d
          );

          --suite-muted-fg: var(
            --muted-foreground,
            #94a3b8
          );

          --suite-border: var(
            --border,
            rgba(255, 255, 255, 0.1)
          );

          min-height: 100vh;
          padding: 24px;

          background:
            radial-gradient(
              circle at 100% 0%,
              rgba(212, 167, 44, 0.08),
              transparent 32%
            ),
            var(--suite-bg);

          color: var(--suite-fg);

          transition:
            background 0.25s ease,
            color 0.25s ease;
        }

        .hero,
        .panel,
        .stat {
          background: var(--suite-card);
          color: var(--suite-card-fg);

          border: 1px solid var(--suite-border);

          border-radius: 20px;

          box-shadow:
            0 18px 45px
              rgba(0, 0, 0, 0.16);

          transition:
            background 0.25s ease,
            border-color 0.25s ease,
            color 0.25s ease,
            box-shadow 0.25s ease;
        }

        .hero {
          padding: 28px;

          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 20px;
        }

        .eyebrow {
          font-size: 11px;
          letter-spacing: 0.16em;

          color: var(--suite-primary);

          font-weight: 900;
        }

        .hero h1 {
          margin: 8px 0;

          color: var(--suite-fg);

          font-size: clamp(
            28px,
            4vw,
            46px
          );

          line-height: 1.08;
        }

        .hero p,
        .muted {
          color: var(--suite-muted-fg);
        }

        .refresh,
        .tabs button,
        .form button,
        .actions button,
        .reportGrid button {
          cursor: pointer;

          border: 1px solid var(--suite-border);

          border-radius: 10px;

          padding: 10px 13px;

          background: var(--suite-secondary);

          color: var(--suite-secondary-fg);

          font-weight: 800;

          transition:
            background 0.2s ease,
            color 0.2s ease,
            border-color 0.2s ease,
            transform 0.15s ease;
        }

        .refresh:hover,
        .tabs button:hover,
        .actions button:hover,
        .reportGrid button:hover {
          background: var(--suite-accent);

          color: var(--suite-accent-fg);

          border-color: var(--suite-primary);

          transform: translateY(-1px);
        }

        .refresh:focus-visible,
        .tabs button:focus-visible,
        .form button:focus-visible,
        .actions button:focus-visible,
        .reportGrid button:focus-visible,
        .link:focus-visible,
        .form input:focus-visible,
        .form select:focus-visible,
        .form textarea:focus-visible {
          outline: 2px solid var(--suite-primary);

          outline-offset: 2px;
        }

        .tabs {
          display: flex;

          gap: 8px;

          overflow-x: auto;

          padding: 14px 0;

          scrollbar-width: thin;

          scrollbar-color:
            var(--suite-primary)
            transparent;
        }

        .tabs::-webkit-scrollbar {
          height: 5px;
        }

        .tabs::-webkit-scrollbar-thumb {
          background: var(--suite-primary);

          border-radius: 999px;
        }

        .tabs button {
          flex: 0 0 auto;

          white-space: nowrap;
        }

        .tabs .active {
          background: var(--suite-primary);

          color: var(--suite-primary-fg);

          border-color: var(--suite-primary);

          box-shadow:
            0 8px 22px
              rgba(0, 0, 0, 0.18);
        }

        .message {
          padding: 12px 14px;

          margin-bottom: 14px;

          border-radius: 12px;

          border: 1px solid var(--suite-border);

          background: var(--suite-accent);

          color: var(--suite-fg);

          font-weight: 700;
        }

        .stats {
          display: grid;

          grid-template-columns:
            repeat(6, 1fr);

          gap: 12px;

          margin-bottom: 16px;
        }

        .secondaryStats {
          margin-top: 0;
        }

        .stat {
          padding: 18px;

          position: relative;

          overflow: hidden;
        }

        .stat::before {
          content: "";

          position: absolute;

          top: 0;
          left: 0;
          right: 0;

          height: 2px;

          background: var(--suite-primary);

          opacity: 0.7;
        }

        .stat b {
          display: block;

          font-size: 11px;

          color: var(--suite-muted-fg);

          text-transform: uppercase;

          letter-spacing: 0.05em;
        }

        .stat strong {
          display: block;

          margin-top: 7px;

          font-size: 25px;

          color: var(--suite-fg);
        }

        .grid {
          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 16px;
        }

        .panel {
          padding: 20px;

          margin-bottom: 16px;

          overflow: hidden;
        }

        .panel h2 {
          margin: 0 0 15px;

          color: var(--suite-fg);

          font-size: 22px;
        }

        .flow {
          display: flex;

          gap: 10px;

          flex-wrap: wrap;
        }

        .flow span {
          padding: 11px;

          border-radius: 12px;

          background: var(--suite-muted);

          border: 1px solid var(--suite-border);

          color: var(--suite-fg);

          transition:
            background 0.2s ease,
            border-color 0.2s ease,
            transform 0.2s ease;
        }

        .flow span:hover {
          background: var(--suite-accent);

          border-color: var(--suite-primary);

          transform: translateY(-1px);
        }

        .tokenGrid {
          display: grid;

          grid-template-columns:
            repeat(
              auto-fill,
              minmax(180px, 1fr)
            );

          gap: 12px;
        }

        .token {
          padding: 16px;

          border-radius: 16px;

          background: var(--suite-muted);

          border: 1px solid var(--suite-border);

          transition:
            transform 0.2s ease,
            border-color 0.2s ease,
            background 0.2s ease;
        }

        .token:hover {
          transform: translateY(-2px);

          border-color: var(--suite-primary);

          background: var(--suite-accent);
        }

        .tokenNo {
          font-size: 30px;

          font-weight: 900;

          color: var(--suite-primary);
        }

        .token b {
          display: block;

          margin-top: 5px;

          color: var(--suite-fg);
        }

        .token small {
          display: block;

          margin-top: 6px;

          color: var(--suite-muted-fg);
        }

        .token strong {
          display: block;

          margin-top: 6px;

          color: var(--suite-fg);

          text-transform: capitalize;
        }

        .actions {
          display: flex;

          gap: 6px;

          margin-top: 12px;
        }

        .actions button {
          font-size: 10px;

          padding: 7px;
        }

        .form {
          display: grid;

          gap: 9px;

          margin-bottom: 16px;
        }

        .form input,
        .form select,
        .form textarea {
          width: 100%;

          box-sizing: border-box;

          background: var(--suite-bg);

          color: var(--suite-fg);

          border: 1px solid var(--suite-border);

          border-radius: 10px;

          padding: 11px;

          outline: none;

          transition:
            border-color 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }

        .form input::placeholder,
        .form textarea::placeholder {
          color: var(--suite-muted-fg);
        }

        .form input:focus,
        .form select:focus,
        .form textarea:focus {
          border-color: var(--suite-primary);

          box-shadow:
            0 0 0 3px
              rgba(212, 167, 44, 0.12);
        }

        .form button {
          min-height: 42px;

          background: var(--suite-primary);

          color: var(--suite-primary-fg);

          border-color: var(--suite-primary);
        }

        .form button:hover {
          filter: brightness(1.08);

          transform: translateY(-1px);
        }

        .checkbox {
          display: flex;

          align-items: center;

          gap: 8px;

          min-height: 40px;

          color: var(--suite-fg);

          cursor: pointer;
        }

        .checkbox input {
          width: 18px;
          height: 18px;

          accent-color: var(--suite-primary);
        }

        .row {
          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 10px;

          padding: 11px 0;

          border-bottom: 1px solid var(--suite-border);

          color: var(--suite-fg);
        }

        .row:last-child {
          border-bottom: 0;
        }

        .row span {
          color: var(--suite-muted-fg);

          text-align: right;
        }

        .status {
          font-weight: 800;
        }

        .activeStatus {
          color: var(--suite-primary) !important;
        }

        .miniStats {
          display: grid;

          grid-template-columns:
            repeat(2, 1fr);

          gap: 10px;

          margin: 16px 0;
        }

        .miniStats > div {
          padding: 14px;

          border-radius: 14px;

          background: var(--suite-muted);

          border: 1px solid var(--suite-border);
        }

        .miniStats span {
          display: block;

          color: var(--suite-muted-fg);

          font-size: 12px;
        }

        .miniStats strong {
          display: block;

          margin-top: 5px;

          color: var(--suite-fg);
        }

        .link {
          display: block;

          color: var(--suite-primary);

          margin: 12px 0;

          font-weight: 800;

          text-decoration: none;

          transition:
            color 0.2s ease,
            transform 0.2s ease;
        }

        .link:hover {
          color: var(--suite-fg);

          transform: translateX(3px);
        }

        .reportGrid {
          display: grid;

          grid-template-columns:
            repeat(3, 1fr);

          gap: 9px;

          margin-bottom: 18px;
        }

        .loading {
          display: flex;

          align-items: center;

          justify-content: center;

          gap: 10px;

          text-align: center;

          padding: 20px;

          color: var(--suite-muted-fg);
        }

        .loader {
          width: 18px;
          height: 18px;

          border-radius: 50%;

          border: 2px solid var(--suite-border);

          border-top-color: var(--suite-primary);

          animation:
            suite-spin
            0.8s linear infinite;
        }

        @keyframes suite-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .stats {
            grid-template-columns:
              repeat(3, 1fr);
          }
        }

        @media (max-width: 900px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .reportGrid {
            grid-template-columns:
              repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .suite {
            padding: 12px;
          }

          .hero {
            flex-direction: column;

            align-items: stretch;

            padding: 20px;
          }

          .hero h1 {
            font-size: 32px;
          }

          .hero p {
            line-height: 1.6;
          }

          .stats {
            grid-template-columns:
              repeat(2, 1fr);

            gap: 9px;
          }

          .stat {
            padding: 14px;
          }

          .stat strong {
            font-size: 21px;
          }

          .reportGrid {
            grid-template-columns: 1fr 1fr;
          }

          .panel {
            padding: 16px;
          }

          .row {
            align-items: flex-start;

            flex-direction: column;
          }

          .row span {
            text-align: left;
          }

          .miniStats {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 380px) {
          .stats {
            grid-template-columns: 1fr;
          }

          .reportGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <b>{label}</b>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({ title, children }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Empty({ text }) {
  return (
    <div className="muted empty">
      {text}
    </div>
  )
}