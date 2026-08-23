import { defineConfig } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "react/display-name": "off",
    },
    ignores: [
      ".next/**",
      "node_modules/**",
      "android/**",
      "public/**",
      "supabase/**",
    ],
  },
])
