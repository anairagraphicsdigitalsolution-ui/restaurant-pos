"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function SuperAdminUsersPage() {
  const [restaurants, setRestaurants] = useState([])
  const [form, setForm] = useState({
    restaurant_id: "",
    role: "admin",
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [created, setCreated] = useState(null)

  useEffect(() => {
    loadRestaurants()
  }, [])

  async function loadRestaurants() {
    try {
      setLoading(true)

      const {
        data: { session }
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        alert("Login session expired. Please login again.")
        return
      }

      const response = await fetch("/api/super-admin/users?type=restaurants", {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load restaurants")
      }

      setRestaurants(result.restaurants || [])

      if (!form.restaurant_id && result.restaurants?.length) {
        setForm(prev => ({
          ...prev,
          restaurant_id: result.restaurants[0].id
        }))
      }
    } catch (error) {
      console.error(error)
      alert(error.message || "Unable to load restaurants")
    } finally {
      setLoading(false)
    }
  }

  function updateField(name, value) {
    setForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  function generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"

    let password = ""
    const array = new Uint32Array(14)
    crypto.getRandomValues(array)

    for (let i = 0; i < array.length; i++) {
      password += chars[array[i] % chars.length]
    }

    setForm(prev => ({
      ...prev,
      password,
      confirmPassword: password
    }))
    setShowPassword(true)
  }

  async function createUser() {
    setCreated(null)

    if (!form.restaurant_id) {
      alert("Select restaurant")
      return
    }

    if (!form.name.trim()) {
      alert("Enter name")
      return
    }

    if (!form.email.trim()) {
      alert("Enter email / login ID")
      return
    }

    if (form.password.length < 8) {
      alert("Password must be at least 8 characters")
      return
    }

    if (form.password !== form.confirmPassword) {
      alert("Passwords do not match")
      return
    }

    try {
      setSaving(true)

      const {
        data: { session }
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        throw new Error("Login session expired. Please login again.")
      }

      const response = await fetch("/api/super-admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          restaurant_id: form.restaurant_id,
          role: form.role,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to create user")
      }

      setCreated({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        restaurant: restaurants.find(r => r.id === form.restaurant_id)?.name || ""
      })

      setForm(prev => ({
        ...prev,
        name: "",
        email: "",
        password: "",
        confirmPassword: ""
      }))

      alert(`${form.role === "admin" ? "Admin" : "Staff"} created successfully ✅`)
    } catch (error) {
      console.error("CREATE USER ERROR:", error)
      alert(error.message || "Unable to create user")
    } finally {
      setSaving(false)
    }
  }

  const styles = {
    page: {
      minHeight: "100vh",
      padding: "35px",
      background:
        "linear-gradient(135deg,var(--background) 0%,var(--surface-2) 50%,var(--surface) 100%)",
      color: "#fff",
      fontFamily: "Inter, Arial, sans-serif"
    },
    wrap: {
      maxWidth: "1050px",
      margin: "0 auto"
    },
    header: {
      padding: "30px",
      borderRadius: "28px",
      marginBottom: "25px",
      background:
        "linear-gradient(135deg,var(--surface),var(--surface-2))",
      border: "1px solid rgba(var(--primary-rgb),.25)",
      boxShadow: "0 25px 60px rgba(0,0,0,.4)"
    },
    eyebrow: {
      color: "var(--primary)",
      letterSpacing: "2px",
      fontSize: "13px",
      fontWeight: "800"
    },
    title: {
      margin: "10px 0 8px",
      color: "var(--primary)",
      fontSize: "42px"
    },
    card: {
      padding: "30px",
      borderRadius: "25px",
      background: "rgba(var(--surface-2-rgb),.9)",
      border: "1px solid rgba(var(--primary-rgb),.2)",
      boxShadow: "0 20px 50px rgba(0,0,0,.3)"
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(2,minmax(0,1fr))",
      gap: "18px"
    },
    label: {
      display: "block",
      marginBottom: "8px",
      color: "var(--muted)",
      fontSize: "13px",
      fontWeight: "700"
    },
    input: {
      width: "100%",
      boxSizing: "border-box",
      padding: "14px 15px",
      borderRadius: "12px",
      border: "1px solid rgba(var(--muted-rgb),.25)",
      background: "var(--background)",
      color: "#fff",
      outline: "none",
      fontSize: "15px"
    },
    full: {
      gridColumn: "1 / -1"
    },
    button: {
      width: "100%",
      marginTop: "22px",
      padding: "16px",
      border: "none",
      borderRadius: "14px",
      background: "linear-gradient(90deg,var(--primary),var(--warning))",
      color: "var(--surface)",
      fontWeight: "900",
      fontSize: "16px",
      cursor: "pointer"
    },
    result: {
      marginTop: "25px",
      padding: "22px",
      borderRadius: "18px",
      background: "rgba(var(--success-rgb),.08)",
      border: "1px solid rgba(var(--success-rgb),.35)"
    }
  }

  return (
    <main style={styles.page} className="super-admin-users-page">
      <div style={styles.wrap}>
        <section style={styles.header}>
          <div style={styles.eyebrow}>PREMIUM CONTROL CENTER</div>
          <h1 style={styles.title}>👤 Admin & Staff Manager</h1>
          <p style={{ color: "var(--muted)", margin: 0 }}>
            Create restaurant Admin and Staff login accounts.
          </p>
        </section>

        <section style={styles.card}>
          <div style={styles.grid}>
            <div style={styles.full}>
              <label style={styles.label}>Restaurant</label>
              <select
                value={form.restaurant_id}
                onChange={e => updateField("restaurant_id", e.target.value)}
                style={styles.input}
                disabled={loading}
              >
                <option value="">
                  {loading ? "Loading restaurants..." : "Select Restaurant"}
                </option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={styles.label}>Account Type</label>
              <select
                value={form.role}
                onChange={e => updateField("role", e.target.value)}
                style={styles.input}
              >
                <option value="admin">Admin</option>
                <option value="staff">Staff</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Name</label>
              <input
                value={form.name}
                onChange={e => updateField("name", e.target.value)}
                placeholder="Admin / Staff name"
                style={styles.input}
              />
            </div>

            <div style={styles.full}>
              <label style={styles.label}>Login Email / ID</label>
              <input
                type="email"
                value={form.email}
                onChange={e => updateField("email", e.target.value)}
                placeholder="admin@restaurant.com"
                style={styles.input}
                autoComplete="off"
              />
            </div>

            <div>
              <label style={styles.label}>Password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={e => updateField("password", e.target.value)}
                placeholder="Minimum 8 characters"
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label style={styles.label}>Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                value={form.confirmPassword}
                onChange={e =>
                  updateField("confirmPassword", e.target.value)
                }
                placeholder="Confirm password"
                style={styles.input}
                autoComplete="new-password"
              />
            </div>

            <div style={styles.full}>
              <button
                type="button"
                onClick={generatePassword}
                style={{
                  ...styles.button,
                  marginTop: 0,
                  background: "transparent",
                  color: "var(--primary)",
                  border: "1px solid rgba(var(--primary-rgb),.35)"
                }}
              >
                🔐 Generate Strong Password
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={createUser}
            disabled={saving}
            style={{
              ...styles.button,
              opacity: saving ? 0.6 : 1,
              cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            {saving
              ? "Creating..."
              : `Create ${form.role === "admin" ? "Admin" : "Staff"}`}
          </button>

          {created && (
            <div style={styles.result}>
              <h3 style={{ marginTop: 0, color: "#86efac" }}>
                ✅ Account Created
              </h3>
              <p><b>Restaurant:</b> {created.restaurant}</p>
              <p><b>Role:</b> {created.role}</p>
              <p><b>Name:</b> {created.name}</p>
              <p><b>Login ID:</b> {created.email}</p>
              <p><b>Password:</b> {created.password}</p>
              <p style={{ color: "var(--muted)", fontSize: 13 }}>
                Save these credentials securely and give them only to the
                restaurant user.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
