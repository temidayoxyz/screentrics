import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./app.css";
import { applyStoredTheme } from "./theme";

applyStoredTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
