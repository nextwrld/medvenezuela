import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import { validateBuildEnv } from "./scripts/build-env"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load .env files early so production builds fail closed with a clear
  // message if VITE_KIMI_AUTH_URL or VITE_APP_ID is missing/invalid. We
  // intentionally validate before any plugin runs so the error reaches
  // the developer before bundling work has started.
  const env = loadEnv(mode, __dirname, "");
  validateBuildEnv(mode, env);

  return {
    plugins: [
      devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
      inspectAttr(), react()],
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@contracts": path.resolve(__dirname, "./contracts"),
        "@db": path.resolve(__dirname, "./db"),
        "db": path.resolve(__dirname, "./db"),
      },
    },
    envDir: path.resolve(__dirname),
    build: {
      outDir: path.resolve(__dirname, "dist/public"),
      emptyOutDir: true,
    },
  };
});
