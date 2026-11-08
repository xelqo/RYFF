import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend runs on :8000; proxy it so the browser only talks to one origin (no CORS, mic works on localhost).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/files": "http://localhost:8000",
    },
  },
});
