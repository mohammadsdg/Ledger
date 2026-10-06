import React from "react";
import { createRoot } from "react-dom/client";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterMomentJalaali } from "@mui/x-date-pickers/AdapterMomentJalaali";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#5fb494" },
    background: { default: "#14171a", paper: "#1b1f22" },
    text: { primary: "#e9e7e0", secondary: "#93998f" },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiTextField: { defaultProps: { size: "small" } },
  },
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterMomentJalaali}>
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
