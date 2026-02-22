import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
