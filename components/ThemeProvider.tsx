"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useAuth } from "@/components/AuthProvider"

export type ThemeDefinition = {
  id: string
  name: string
  description: string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  surface2: string
  text: string
  muted: string
  border: string
  success: string
  danger: string
  warning: string
  info: string
  radius: string
  mode?: "dark" | "light"
  fontFamily?: string
  headingFont?: string
  headingWeight?: number
  shadow?: string
  buttonText?: string
}

/**
 * Logo Premium — DARK PREMIUM is the canonical main theme for the entire SaaS.
 * It is the default for login, Super Admin, Admin, Staff and all application
 * pages until a permitted Admin/Super Admin explicitly selects another theme.
 */
export const DEFAULT_THEME: ThemeDefinition = {
  id: "logo-premium",
  name: "Logo Premium",
  description: "The canonical restaurant core theme: midnight navy, graphite surfaces, electric gold actions, emerald status and warm ivory text.",
  // Exact visual direction from the approved Logo Premium preview:
  // #0c1020 / #191c2c navy surfaces + #fbbf24 gold + #22c55e green.
  primary: "#fbbf24",
  secondary: "#080b18",
  accent: "#22c55e",
  background: "#0c1020",
  surface: "#191c2c",
  surface2: "#0c1020",
  text: "#fffaf0",
  muted: "#a9b0bf",
  border: "#fbbf24",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#60a5fa",
  radius: "16px",
  mode: "dark",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  headingFont: "Inter, ui-sans-serif, system-ui, sans-serif",
  headingWeight: 800,
  shadow: "0 18px 55px rgba(0,0,0,.34), 0 2px 12px rgba(0,0,0,.22)",
  buttonText: "#0c1020",
}

export const BRAND_THEMES: ThemeDefinition[] = [
  DEFAULT_THEME,
  {
    id: "emerald-gold-premium",
    name: "Emerald Gold Premium",
    description: "Alternate emerald and gold restaurant theme.",
    primary: "#e9a72d",
    secondary: "#071b12",
    accent: "#4a9b3c",
    background: "#020a06",
    surface: "#0b2118",
    surface2: "#102b20",
    text: "#fffaf0",
    muted: "#b7c7bd",
    border: "#e9a72d",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "obsidian-gold",
    name: "Obsidian Gold",
    description: "Deep obsidian black with refined champagne gold and warm ivory.",
    primary: "#e8b95a",
    secondary: "#11100d",
    accent: "#f3d58a",
    background: "#050504",
    surface: "#12110e",
    surface2: "#1b1914",
    text: "#fffaf0",
    muted: "#c4b9a2",
    border: "#b98a32",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "himalayan-pine",
    name: "Himalayan Pine",
    description: "Mountain-inspired pine green, cedar and warm alpine gold.",
    primary: "#d5a84f",
    secondary: "#07150f",
    accent: "#4fa56a",
    background: "#020a06",
    surface: "#0a1c13",
    surface2: "#10271b",
    text: "#fffdf5",
    muted: "#b5c8ba",
    border: "#d5a84f",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "sapphire-noir",
    name: "Sapphire Noir",
    description: "Luxury midnight navy with sapphire blue and platinum highlights.",
    primary: "#6ea8ff",
    secondary: "#07101f",
    accent: "#b7d4ff",
    background: "#02050b",
    surface: "#0a1220",
    surface2: "#111d31",
    text: "#f5f9ff",
    muted: "#a8b7ca",
    border: "#4d8cff",
    success: "#34d399",
    danger: "#fb7185",
    warning: "#fbbf24",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "rosewood-luxe",
    name: "Rosewood Luxe",
    description: "Elegant rosewood, burgundy and antique champagne for fine dining.",
    primary: "#e2b36f",
    secondary: "#1b0c0e",
    accent: "#b94d5d",
    background: "#080405",
    surface: "#180a0d",
    surface2: "#241115",
    text: "#fff8f1",
    muted: "#cbb0b0",
    border: "#a83e4e",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "brand-light",
    name: "Brand Light",
    description: "Bright white restaurant interface with strong brand contrast.",
    primary: "#9a6500",
    secondary: "#ffffff",
    accent: "#237a2c",
    background: "#f5f7f4",
    surface: "#ffffff",
    surface2: "#edf2ed",
    text: "#172019",
    muted: "#526158",
    border: "#c9b06b",
    success: "#15803d",
    danger: "#b91c1c",
    warning: "#a16207",
    info: "#1d4ed8",
    radius: "16px",
    mode: "light",
  },
  {
    id: "ruby-luxe",
    name: "Ruby Luxe",
    description: "Premium charcoal with ruby red and gold highlights.",
    primary: "#f0b323",
    secondary: "#171313",
    accent: "#b20f19",
    background: "#090707",
    surface: "#1b1515",
    surface2: "#261b1b",
    text: "#fffaf0",
    muted: "#c8b8b8",
    border: "#b20f19",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "18px",
    mode: "dark",
  },
  {
    id: "ocean-platinum",
    name: "Ocean Platinum",
    description: "Modern navy, cyan and platinum interface.",
    primary: "#38bdf8",
    secondary: "#071521",
    accent: "#67e8f9",
    background: "#020b14",
    surface: "#0b1b2b",
    surface2: "#10263a",
    text: "#f3fbff",
    muted: "#9fb6c8",
    border: "#38bdf8",
    success: "#34d399",
    danger: "#fb7185",
    warning: "#fbbf24",
    info: "#60a5fa",
    radius: "18px",
    mode: "dark",
  },
  {
    id: "royal-purple",
    name: "Royal Purple",
    description: "Elegant plum, violet and champagne gold.",
    primary: "#d8b4fe",
    secondary: "#171025",
    accent: "#a78bfa",
    background: "#090611",
    surface: "#171025",
    surface2: "#211638",
    text: "#fbf7ff",
    muted: "#b9accb",
    border: "#a78bfa",
    success: "#4ade80",
    danger: "#fb7185",
    warning: "#fbbf24",
    info: "#60a5fa",
    radius: "20px",
    mode: "dark",
  },
  {
    id: "midnight-champagne",
    name: "Midnight Champagne",
    description: "Ultra-premium midnight interface with champagne gold and teal glow.",
    primary: "#e7c56a",
    secondary: "#0b0c14",
    accent: "#2dd4bf",
    background: "#05060b",
    surface: "#10121b",
    surface2: "#171a25",
    text: "#fffaf0",
    muted: "#a9a7b0",
    border: "#e7c56a",
    success: "#34d399",
    danger: "#fb7185",
    warning: "#fbbf24",
    info: "#60a5fa",
    radius: "22px",
    mode: "dark",
  },
  {
    id: "aurora-luxe",
    name: "Aurora Luxe",
    description: "Modern charcoal, violet and mint with a premium SaaS glow.",
    primary: "#c4b5fd",
    secondary: "#0a0912",
    accent: "#5eead4",
    background: "#05040a",
    surface: "#12101d",
    surface2: "#1b1729",
    text: "#faf7ff",
    muted: "#b4aec1",
    border: "#8b5cf6",
    success: "#34d399",
    danger: "#fb7185",
    warning: "#fbbf24",
    info: "#60a5fa",
    radius: "22px",
    mode: "dark",
  },
  {
    id: "forest-luxe",
    name: "Forest Luxe",
    description: "Deep forest green with champagne and ivory.",
    primary: "#d9ad55",
    secondary: "#0a2117",
    accent: "#3f9a65",
    background: "#03100a",
    surface: "#0b2418",
    surface2: "#123321",
    text: "#fffdf5",
    muted: "#b4c5b9",
    border: "#d9ad55",
    success: "#4ade80",
    danger: "#ef4444",
    warning: "#f59e0b",
    info: "#60a5fa",
    radius: "22px",
    mode: "dark",
  },
  {
    id: "saffron-heritage",
    name: "Saffron Heritage",
    description: "Warm Indian-inspired luxury with saffron, maroon and ivory.",
    primary: "#f59e0b", secondary: "#2a0f0f", accent: "#dc2626", background: "#120707", surface: "#211010", surface2: "#301515", text: "#fffaf0", muted: "#d6b8a6", border: "#f59e0b", success: "#4ade80", danger: "#ef4444", warning: "#fbbf24", info: "#60a5fa", radius: "20px", mode: "dark",
  },
  {
    id: "coastal-breeze",
    name: "Coastal Breeze",
    description: "Bright premium coastal palette with aqua, navy and pearl.",
    primary: "#0891b2", secondary: "#062b36", accent: "#67e8f9", background: "#03141a", surface: "#082832", surface2: "#0d3540", text: "#f2fdff", muted: "#a9cbd2", border: "#22d3ee", success: "#34d399", danger: "#fb7185", warning: "#fbbf24", info: "#60a5fa", radius: "22px", mode: "dark",
  },
  {
    id: "terracotta-table",
    name: "Terracotta Table",
    description: "Boutique dining look with terracotta, espresso and cream.",
    primary: "#ea7c4b", secondary: "#241611", accent: "#f3c892", background: "#0f0907", surface: "#20130e", surface2: "#2c1b14", text: "#fff8ee", muted: "#cdb6a3", border: "#ea7c4b", success: "#65a30d", danger: "#dc2626", warning: "#f59e0b", info: "#60a5fa", radius: "18px", mode: "dark",
  },
  {
    id: "sakura-dining",
    name: "Sakura Dining",
    description: "Refined rose, plum and soft champagne for modern dining.",
    primary: "#f472b6", secondary: "#21101a", accent: "#f9a8d4", background: "#0e070c", surface: "#1d0f18", surface2: "#2a1422", text: "#fff7fb", muted: "#cdb2c2", border: "#ec4899", success: "#34d399", danger: "#fb7185", warning: "#fbbf24", info: "#93c5fd", radius: "22px", mode: "dark",
  },
  {
    id: "copper-noir",
    name: "Copper Noir",
    description: "Moody black with copper metal accents for upscale restaurants.",
    primary: "#c47f46", secondary: "#17110d", accent: "#f1b878", background: "#070605", surface: "#15100c", surface2: "#211711", text: "#fff9f1", muted: "#bfae9f", border: "#c47f46", success: "#4ade80", danger: "#f87171", warning: "#f59e0b", info: "#60a5fa", radius: "16px", mode: "dark",
  },
  {
    id: "olive-modern",
    name: "Olive Modern",
    description: "Contemporary olive, cream and brass palette for all-day dining.",
    primary: "#a3a63a", secondary: "#172015", accent: "#d4b85a", background: "#080d08", surface: "#121b12", surface2: "#1b2719", text: "#fbfff4", muted: "#b8c2ad", border: "#a3a63a", success: "#65a30d", danger: "#ef4444", warning: "#eab308", info: "#60a5fa", radius: "20px", mode: "dark",
  },
  {
    id: "pearl-minimal",
    name: "Pearl Minimal",
    description: "Premium light theme with pearl white, graphite and champagne.",
    primary: "#7c5f2a", secondary: "#ffffff", accent: "#d4af63", background: "#f7f6f2", surface: "#ffffff", surface2: "#f1efe8", text: "#1f2320", muted: "#626a63", border: "#d7c79f", success: "#15803d", danger: "#b91c1c", warning: "#a16207", info: "#1d4ed8", radius: "16px", mode: "light",
  },
  {
    id: "royal-maroon",
    name: "Royal Maroon",
    description: "Classic Indian fine-dining palette with maroon and antique gold.",
    primary: "#d4a24c", secondary: "#2b0c14", accent: "#8f1d36", background: "#0f0509", surface: "#210b12", surface2: "#32101a", text: "#fff8ed", muted: "#cdb0a8", border: "#d4a24c", success: "#4ade80", danger: "#ef4444", warning: "#fbbf24", info: "#60a5fa", radius: "20px", mode: "dark",
  },
  {
    id: "matcha-luxe",
    name: "Matcha Luxe",
    description: "Calm matcha green with jade and warm ivory accents.",
    primary: "#84a98c", secondary: "#0c1712", accent: "#cad2a2", background: "#050c08", surface: "#0e1b14", surface2: "#16271e", text: "#f8fff8", muted: "#afc0b3", border: "#84a98c", success: "#4ade80", danger: "#ef4444", warning: "#f59e0b", info: "#60a5fa", radius: "22px", mode: "dark",
  },
  {
    id: "ivory-graphite",
    name: "Ivory Graphite",
    description: "Ultra-clean white workspace with graphite text and electric blue actions.",
    primary: "#1d4ed8",
    secondary: "#0f172a",
    accent: "#2563eb",
    background: "#f6f8fb",
    surface: "#ffffff",
    surface2: "#eef2f7",
    text: "#0f172a",
    muted: "#475467",
    border: "#cfd7e3",
    success: "#15803d",
    danger: "#dc2626",
    warning: "#b45309",
    info: "#2563eb",
    radius: "14px",
    mode: "light",
  },
  {
    id: "white-emerald",
    name: "White Emerald",
    description: "Fresh restaurant workspace with crisp white surfaces and emerald actions.",
    primary: "#047857",
    secondary: "#0b1f17",
    accent: "#059669",
    background: "#f4f8f5",
    surface: "#ffffff",
    surface2: "#edf4ef",
    text: "#102018",
    muted: "#4b6357",
    border: "#cbded3",
    success: "#15803d",
    danger: "#dc2626",
    warning: "#a16207",
    info: "#0369a1",
    radius: "16px",
    mode: "light",
  },
  {
    id: "pearl-cobalt",
    name: "Pearl Cobalt",
    description: "Premium white and slate layout with confident cobalt highlights.",
    primary: "#1e40af",
    secondary: "#111827",
    accent: "#2563eb",
    background: "#f7f9fc",
    surface: "#ffffff",
    surface2: "#edf1f7",
    text: "#101828",
    muted: "#475467",
    border: "#d0d8e4",
    success: "#15803d",
    danger: "#dc2626",
    warning: "#a16207",
    info: "#1d4ed8",
    radius: "18px",
    mode: "light",
  },
  {
    id: "paper-coral",
    name: "Paper Coral",
    description: "Warm editorial white theme with charcoal typography and coral accents.",
    primary: "#c2410c",
    secondary: "#292524",
    accent: "#ea580c",
    background: "#fbfaf8",
    surface: "#ffffff",
    surface2: "#f6f1ec",
    text: "#1c1917",
    muted: "#57534e",
    border: "#dfd5cc",
    success: "#15803d",
    danger: "#dc2626",
    warning: "#a16207",
    info: "#0369a1",
    radius: "16px",
    mode: "light",
  },

]

// Keep every preset visually consistent at a production/SaaS level while
// preserving each theme's identity. Missing presentation tokens inherit a
// safe premium baseline; explicit theme colors are never overwritten.
export const PRO_BRAND_THEMES: ThemeDefinition[] = BRAND_THEMES.map((theme) => ({
  ...theme,
  fontFamily: theme.fontFamily || "Inter, ui-sans-serif, system-ui, sans-serif",
  headingFont: theme.headingFont || "Inter, ui-sans-serif, system-ui, sans-serif",
  headingWeight: theme.headingWeight || 800,
  shadow: theme.shadow || (theme.mode === "light"
    ? "0 12px 34px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.04)"
    : "0 18px 55px rgba(0,0,0,.26), 0 2px 10px rgba(0,0,0,.16)"),
  buttonText: theme.buttonText || (theme.mode === "light" ? "#ffffff" : "#08110b"),
}))

// BRAND_THEMES is kept as the public catalog for existing consumers.
// The catalog itself now contains the premium presentation tokens.
BRAND_THEMES.splice(0, BRAND_THEMES.length, ...PRO_BRAND_THEMES)

type ThemeContextValue = {
  theme: ThemeDefinition
  themes: ThemeDefinition[]
  restaurantId: string | null
  setTheme: (themeId: string, persist?: boolean) => Promise<void>
  setThemeList: (themes: ThemeDefinition[], themeId: string, persist?: boolean) => Promise<void>
  refreshTheme: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function hexToRgb(hex: string) {
  const clean = hex.replace("#", "")
  const value = clean.length === 3
    ? clean.split("").map((x) => x + x).join("")
    : clean
  const num = Number.parseInt(value, 16)
  return `${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}`
}

export function applyTheme(theme: ThemeDefinition) {
  const root = document.documentElement

  const vars: Record<string, string> = {
    "--primary": theme.primary,
    "--primary-rgb": hexToRgb(theme.primary),
    "--secondary": theme.secondary,
    "--secondary-rgb": hexToRgb(theme.secondary),
    "--accent": theme.accent,
    "--accent-rgb": hexToRgb(theme.accent),
    "--background": theme.background,
    "--background-rgb": hexToRgb(theme.background),
    "--surface": theme.surface,
    "--surface-rgb": hexToRgb(theme.surface),
    "--surface-2": theme.surface2,
    "--surface-2-rgb": hexToRgb(theme.surface2),
    "--text": theme.text,
    "--muted": theme.muted,
    "--muted-rgb": hexToRgb(theme.muted),
    "--border": theme.border,
    "--success": theme.success,
    "--danger": theme.danger,
    "--warning": theme.warning,
    "--info": theme.info,
    "--radius": theme.radius,
    "--theme-mode": theme.mode || "dark",
    "--font-family": theme.fontFamily || "Inter, system-ui, sans-serif",
    "--heading-font": theme.headingFont || "Inter, system-ui, sans-serif",
    "--heading-weight": String(theme.headingWeight || 800),
    "--theme-shadow": theme.shadow || "0 12px 32px rgba(15,23,42,.08)",
    "--button-text": theme.buttonText || "#ffffff",
  }

  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.theme = theme.id
  root.dataset.themeMode = theme.mode || "dark"
  root.style.colorScheme = theme.mode === "light" ? "light" : "dark"
  root.style.setProperty("--theme-transition", "background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease")
  root.style.setProperty("--button-text", theme.buttonText || (theme.mode === "light" ? "#ffffff" : "#08110b"))
  root.style.fontFamily = theme.fontFamily || "Inter, ui-sans-serif, system-ui, sans-serif"
}

function mergeThemeList(customThemes: unknown): ThemeDefinition[] {
  const custom = Array.isArray(customThemes) ? customThemes : []
  const result: ThemeDefinition[] = []

  for (const item of [...BRAND_THEMES, ...custom]) {
    if (!item?.id || result.some((theme) => theme.id === item.id)) continue
    result.push(item as ThemeDefinition)
  }

  return result
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeDefinition>(DEFAULT_THEME)
  const [availableThemes, setAvailableThemes] = useState<ThemeDefinition[]>(BRAND_THEMES)
  const { restaurantId, role } = useAuth()

  const loadTheme = useCallback(async () => {
    // Super Admin has a platform-only theme. It is intentionally not tied
    // to any restaurant so the SaaS control panel can be branded separately.
    if (role === "super_admin") {
      // Platform theme is server-authoritative and independent from every
      // restaurant theme. localStorage is intentionally not used as the
      // source of truth so the same platform theme follows the Super Admin
      // across browsers/devices.
      const { data, error } = await supabase
        .from("platform_settings")
        .select("config")
        .eq("setting_key", "theme")
        .maybeSingle()

      if (error) {
        console.error("PLATFORM THEME LOAD ERROR:", error)
      }

      const savedId = data?.config?.selected
      const selected = BRAND_THEMES.find((item) => item.id === savedId) || DEFAULT_THEME
      setAvailableThemes(BRAND_THEMES)
      setThemeState(selected)
      return
    }

    // Theme storage is strictly restaurant-scoped. Never use one
    // restaurant's theme as a fallback for another restaurant.
    if (!restaurantId) {
      setAvailableThemes(BRAND_THEMES)
      setThemeState(DEFAULT_THEME)
      return
    }

    const storageKey = `anaira-pos-theme:${restaurantId}`

    // Start from the safe default while the restaurant-specific config loads.
    setThemeState(DEFAULT_THEME)
    setAvailableThemes(BRAND_THEMES)

    const [
      { data: restaurant, error },
      { data: themePlugin },
      { data: themeSettings },
    ] = await Promise.all([
      supabase
        .from("restaurants")
        .select("theme_config")
        .eq("id", restaurantId)
        .maybeSingle(),
      supabase
        .from("restaurant_plugins")
        .select("enabled")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "theme-branding")
        .maybeSingle(),
      supabase
        .from("plugin_settings")
        .select("config")
        .eq("restaurant_id", restaurantId)
        .eq("plugin_code", "theme-branding")
        .maybeSingle(),
    ])

    if (error) {
      console.error("THEME LOAD ERROR:", error)
      return
    }

    const themeList = mergeThemeList(restaurant?.theme_config?.themes)
    setAvailableThemes(themeList)

    const selectedId = restaurant?.theme_config?.selected
    const serverTheme = themeList.find((item) => item.id === selectedId)
    const themeScope = String(
      restaurant?.theme_config?.theme_scope ||
      themeSettings?.config?.theme_scope ||
      "both"
    ).toLowerCase()

    if (themePlugin?.enabled !== true || themeScope === "qr") {
      setThemeState(DEFAULT_THEME)
      window.localStorage.setItem(storageKey, DEFAULT_THEME.id)
    } else if (serverTheme) {
      setThemeState(serverTheme)
      window.localStorage.setItem(storageKey, serverTheme.id)
    } else {
      // No restaurant-specific selection yet: always use the original default.
      // Do not fall back to another restaurant's local theme.
      setThemeState(DEFAULT_THEME)
      window.localStorage.removeItem(storageKey)
    }
  }, [restaurantId, role])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    loadTheme()
  }, [loadTheme])

  const persist = useCallback(async (
    themeList: ThemeDefinition[],
    selectedId: string,
  ) => {
    if (role === "super_admin") {
      const { error } = await supabase
        .from("platform_settings")
        .upsert({
          setting_key: "theme",
          config: { selected: selectedId },
          updated_at: new Date().toISOString(),
        }, { onConflict: "setting_key" })

      if (error) {
        console.error("PLATFORM THEME SAVE ERROR:", error)
        throw error
      }
      return
    }

    if (!restaurantId) return

    const safeList = mergeThemeList(themeList)

    const { data: themeSettings, error: settingsError } = await supabase
      .from("plugin_settings")
      .select("config")
      .eq("restaurant_id", restaurantId)
      .eq("plugin_code", "theme-branding")
      .maybeSingle()

    if (settingsError) {
      console.error("THEME SETTINGS ERROR:", settingsError)
      return
    }

    const { data: restaurantRow, error: restaurantError } = await supabase
      .from("restaurants")
      .select("theme_config")
      .eq("id", restaurantId)
      .maybeSingle()

    if (restaurantError) {
      console.error("THEME RESTAURANT ERROR:", restaurantError)
      return
    }

    const scope = String(
      restaurantRow?.theme_config?.theme_scope ||
      themeSettings?.config?.theme_scope ||
      "both"
    ).toLowerCase()

    const { error: rpcError } = await supabase.rpc("admin_save_restaurant_theme", {
      p_restaurant_id: restaurantId,
      p_theme_config: {
        selected: selectedId,
        themes: safeList,
        theme_scope: scope,
      },
    })

    if (rpcError) {
      console.error("THEME SAVE ERROR:", rpcError)
      throw rpcError
    }
  }, [restaurantId, role])

  const setTheme = useCallback(async (themeId: string, persistChanges = true) => {
    const next = availableThemes.find((item) => item.id === themeId)
    if (!next) return

    setThemeState(next)
    if (role !== "super_admin" && typeof window !== "undefined") {
      window.localStorage.setItem(`anaira-pos-theme:${restaurantId}`, next.id)
    }

    if (persistChanges) {
      await persist(availableThemes, next.id)
    }
  }, [availableThemes, persist, role, restaurantId])

  const setThemeList = useCallback(async (
    themeList: ThemeDefinition[],
    themeId: string,
    persistChanges = true,
  ) => {
    const safeList = mergeThemeList(themeList)
    const next = safeList.find((item) => item.id === themeId) || safeList[0]

    setAvailableThemes(safeList)
    setThemeState(next)

    if (role !== "super_admin" && typeof window !== "undefined") {
      window.localStorage.setItem(`anaira-pos-theme:${restaurantId}`, next.id)
    }

    if (persistChanges) {
      await persist(safeList, next.id)
    }
  }, [persist, role, restaurantId])

  const value = useMemo(() => ({
    theme,
    themes: availableThemes,
    restaurantId,
    setTheme,
    setThemeList,
    refreshTheme: loadTheme,
  }), [theme, availableThemes, restaurantId, setTheme, setThemeList, loadTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside ThemeProvider")
  return context
}
