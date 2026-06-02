"use client";

import { useEffect } from "react";
import { urlBase64ToUint8Array } from "@/lib/utils/push";

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

async function ensureSubscribed(reg: ServiceWorkerRegistration) {
  if (!VAPID_KEY) return;
  try {
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY),
      }));
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (err) {
    // Push is optional but log so issues are visible in DevTools
    console.warn("[PushSetup] subscription failed:", err);
  }
}

export default function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let swReg: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        swReg = reg;

        // Auto-subscribe if the user already granted permission
        if (Notification.permission === "granted") {
          ensureSubscribed(reg);
        }

        // When the SW tells us to navigate (notification clicked while app is open)
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data?.type === "NAVIGATE") {
            window.location.href = event.data.url;
          }
        });
      })
      .catch(() => {
        /* SW registration is optional */
      });

    // React to permission changes via Permissions API (Chrome/Firefox/Edge)
    let permStatus: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: "notifications" as PermissionName })
      .then((status) => {
        permStatus = status;
        status.addEventListener("change", () => {
          if (status.state === "granted" && swReg) {
            ensureSubscribed(swReg);
          }
        });
      })
      .catch(() => {
        // Permissions API not available (iOS Safari) — fall back to polling.
        // Polls only while permission is "default" (undecided); stops as soon
        // as the user makes a choice so it doesn't run forever.
        let lastPerm = Notification.permission;
        if (lastPerm !== "default") return;

        const id = setInterval(() => {
          const current = Notification.permission;
          if (current !== lastPerm) {
            lastPerm = current;
            if (current === "granted" && swReg) {
              ensureSubscribed(swReg);
            }
            clearInterval(id); // permission decided — stop polling
          }
        }, 500);

        // Safety stop after 2 minutes even if user never decides
        setTimeout(() => clearInterval(id), 120_000);
      });

    return () => {
      permStatus?.removeEventListener("change", () => {});
    };
  }, []);

  return null;
}
