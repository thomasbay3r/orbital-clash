import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "public",
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
