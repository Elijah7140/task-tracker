import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  // Relative asset URLs let the desktop shell load the built renderer from a file.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    // The desktop renderer loads from local disk, so one larger bundle costs no network time.
    chunkSizeWarningLimit: 1024,
  },
});
