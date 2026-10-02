import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Three.js est chargé à la demande pour les aperçus 3D ; son chunk séparé est volontaire.
    chunkSizeWarningLimit: 800
  },
  server: {
    port: 5173,
    strictPort: true,
    // Les binaires Rust peuvent être verrouillés pendant la compilation sous Windows.
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
});

