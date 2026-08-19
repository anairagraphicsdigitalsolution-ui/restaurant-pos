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
}

/**
 * The original Anaira/NH3 POS look is intentionally preserved as the
 * first/default theme. All other themes are optional presets.
 */
export const DEFAULT_THEME: ThemeDefinition = {
  id: "classic-default",
  name: "Classic Default",
  description: "Original Anaira POS dark-gold interface.",
  primary: "#fbbf24",
  secondary: "#0f172a",
  accent: "#22c55e",
  background: "#020617",
  surface: "#111827",
  surface2: "#1f2937",
  text: "#ffffff",
  muted: "#94a3b8",
  border: "#fbbf24",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#60a5fa",
  radius: "20px",
  mode: "dark",
}

export const BRAND_THEMES: ThemeDefinition[] = [
  DEFAULT_THEME,
  {
    id: "emerald-gold-premium",
    name: "Emerald Gold Premium",
    description: "Luxury emerald, warm gold and soft natural accents.",
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
]

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
  }

  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value))
  root.dataset.theme = theme.id
  root.dataset.themeMode = theme.mode || "dark"
  root.style.colorScheme = theme.mode === "light" ? "light" : "dark"
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
      const key = "anaira-pos-super-admin-theme"
      const savedId = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
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

    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("theme_config")
      .eq("id", restaurantId)
      .maybeSingle()

    if (error) {
      console.error("THEME LOAD ERROR:", error)
      return
    }

    const themeList = mergeThemeList(restaurant?.theme_config?.themes)
    setAvailableThemes(themeList)

    const selectedId = restaurant?.theme_config?.selected
    const serverTheme = themeList.find((item) => item.id === selectedId)

    if (serverTheme) {
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
      if (typeof window !== "undefined") {
        window.localStorage.setItem("anaira-pos-super-admin-theme", selectedId)
      }
      return
    }

    if (!restaurantId) return

    const safeList = mergeThemeList(themeList)
    const { error } = await supabase
      .from("restaurants")
      .update({
        theme_config: {
          selected: selectedId,
          themes: safeList,
          updated_at: new Date().toISOString(),
        },
      })
      .eq("id", restaurantId)

    if (error) {
      console.error("THEME SAVE ERROR:", error)
    }
  }, [restaurantId])

  const setTheme = useCallback(async (themeId: string, persistChanges = true) => {
    const next = availableThemes.find((item) => item.id === themeId)
    if (!next) return

    setThemeState(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        role === "super_admin"
          ? "anaira-pos-super-admin-theme"
          : `anaira-pos-theme:${restaurantId}`,
        next.id
      )
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

    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        role === "super_admin"
          ? "anaira-pos-super-admin-theme"
          : `anaira-pos-theme:${restaurantId}`,
        next.id
      )
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
