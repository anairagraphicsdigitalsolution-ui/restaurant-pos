import { defineConfig } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals.js"

export default defineConfig([
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "android/**",
      "public/**",
      "supabase/**",
    ],
  },
])
