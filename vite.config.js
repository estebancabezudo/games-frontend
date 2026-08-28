import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "localhost",
    port: 5175,
    strictPort: true,
    allowedHosts: ["games.localhost"],
  },
  preview: {
    host: "localhost",
    port: 5175,
    strictPort: true,
  },
});
