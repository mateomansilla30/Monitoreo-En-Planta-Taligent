import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// En desarrollo, /api va al servidor de la demo (python src/demo.py, puerto 8765).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8765" } },
  build: { chunkSizeWarningLimit: 1000 }, // se sirve en esta compu: el tamaño del archivo no importa
});
