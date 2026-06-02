"use client";

import { useEffect } from "react";

// Registers /sw.js and listens for SW→page navigation messages.
// Deliberately does NOT auto-subscribe: repeated failed subscribe() calls
// can trigger Chrome/FCM throttling. Subscription is only initiated when
// the user explicitly clicks "Activar" in profile settings.
export default function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[PushSetup] SW registered, active:", reg.active?.state);

        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NAVIGATE") {
            window.location.href = event.data.url;
          }
        });
      })
      .catch((err) => {
        console.warn("[PushSetup] SW registration failed:", err);
      });
  }, []);

  return null;
}
