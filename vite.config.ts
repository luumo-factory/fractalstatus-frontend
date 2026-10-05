import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend runs on :8080 by default. In dev we proxy /api to it so the SPA
// can use same-origin relative requests (and avoid any CORS edge cases). The
// proxy target is configurable via VITE_PROXY_TARGET.
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: proxyTarget,
        changeOrigin: true,
        // SSE needs an open, unbuffered connection; the default proxy handles
        // text/event-stream fine as long as we do not buffer.
        ws: false,
      },
    },
  },
});
