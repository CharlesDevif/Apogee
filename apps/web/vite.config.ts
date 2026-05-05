import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const host = env.VITE_BACKEND_HOST || "localhost";
  const port = env.VITE_BACKEND_PORT || "3001";
  const httpTarget = `http://${host}:${port}`;
  const wsTarget = `ws://${host}:${port}`;

  return {
    plugins: [react(), cesium()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        "/api": httpTarget,
        "/ws": { target: wsTarget, ws: true, changeOrigin: true },
      },
    },
  };
});
