const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

module.exports = defineConfig({
  root: path.join(__dirname, "web"),
  plugins: [react(), {
    name: "ledger-offline-shell",
    apply: "build",
    closeBundle() {
      const dist = path.join(__dirname, "dist");
      const assets = fs.readdirSync(path.join(dist, "assets")).map(name => `/assets/${name}`).sort();
      const version = crypto.createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
      const workerPath = path.join(dist, "sw.js");
      const worker = fs.readFileSync(workerPath, "utf8").replace("__LEDGER_BUILD__", version).replace("/* LEDGER_ASSETS */", `, ${assets.map(asset => JSON.stringify(asset)).join(", ")}`);
      fs.writeFileSync(workerPath, worker);
    },
  }],
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@mui/x-date-pickers") || id.includes("node_modules/dayjs") || id.includes("node_modules/moment") || id.includes("node_modules/jalaali-js")) return "dates";
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  server: {
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
});
