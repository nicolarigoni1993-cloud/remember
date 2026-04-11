import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      console.log("Service Worker registrato:", registration.scope);

      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data;

        if (data?.type === "REMEMBER_NOTIFICATION_CLICK") {
          window.focus();
        }
      });
    } catch (error) {
      console.error("Errore registrazione Service Worker:", error);
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);