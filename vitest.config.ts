import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    exclude: ["__tests__/**/*.int.test.ts", "node_modules/**"],
  },
})
