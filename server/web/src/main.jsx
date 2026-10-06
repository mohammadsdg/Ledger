import React from "react";
import { createRoot } from "react-dom/client";
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <App />
      </LocalizationProvider>
    </ThemeProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
