import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: path("./"), base: "./", publicDir: path("../../public"),
  cacheDir: path("../../.qa/material-b-vite"),
  server: { host: "127.0.0.1", port: 5285, strictPort: true, fs: { allow: [path("../../")] } },
  preview: { host: "127.0.0.1", port: 5285, strictPort: true },
  build: { outDir: path("../../.qa/material-b-dist"), emptyOutDir: true },
});
