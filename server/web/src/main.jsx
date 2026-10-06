import React from "react";
import { createRoot } from "react-dom/client";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterMomentJalaali } from "@mui/x-date-pickers/AdapterMomentJalaali";
import { faIR } from "@mui/x-date-pickers/locales";
import moment from "moment-jalaali";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#6cb7ff" },
    background: { default: "#10141b", paper: "#181e27" },
    text: { primary: "#f4f7fb", secondary: "#9ca8b8" },
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif' },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiTextField: { defaultProps: { size: "small" } },
  },
});

moment.loadPersian({ dialect: "persian-modern", usePersianDigits: true });

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterMomentJalaali} adapterLocale="fa" localeText={faIR.components.MuiLocalizationProvider.defaultProps.localeText}>
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
