"use client";
import { useEffect } from "react";

const MIN_MS = 5000;

export default function SplashHider() {
  useEffect(() => {
    const el = document.getElementById("splash");
    if (!el) return;

    const start = (window as Window & { __splashStart?: number }).__splashStart ?? Date.now();
    const elapsed = Date.now() - start;
    const remaining = Math.max(0, MIN_MS - elapsed);

    const t = setTimeout(() => {
      el.style.transition = "opacity 0.35s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 380);
    }, remaining);

    return () => clearTimeout(t);
  }, []);
  return null;
}
