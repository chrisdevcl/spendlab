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
      .then(() => {
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NAVIGATE") {
            window.location.href = event.data.url;
          }
        });
      })
      .catch(() => {
        /* SW registration is optional */
      });
  }, []);

  return null;
}
