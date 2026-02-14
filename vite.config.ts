import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, "src/content.tsx")
      },
      output: {
        entryFileNames: "content.js",
        assetFileNames: "content.css",
        format: "iife"
      }
    }
  }
});
