const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
const path = require("path");

module.exports = defineConfig({
  root: path.join(__dirname, "web"),
  plugins: [react()],
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
