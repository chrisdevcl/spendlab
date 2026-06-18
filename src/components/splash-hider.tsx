"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const AUTH_PATHS = ["/login"];

export default function SplashHider() {
  const pathname = usePathname();

  useEffect(() => {
    const el = document.getElementById("splash");
    if (!el || el.style.display === "none") return;

    const isAuth = AUTH_PATHS.some((p) => pathname.startsWith(p));
    const minMs = isAuth ? 0 : 5000;

    const start = (window as Window & { __splashStart?: number }).__splashStart ?? Date.now();
    const remaining = Math.max(0, minMs - (Date.now() - start));

    const t = setTimeout(() => {
      el.style.transition = "opacity 0.35s ease";
      el.style.opacity = "0";
      setTimeout(() => { el.style.display = "none"; }, 380);
    }, remaining);

    return () => clearTimeout(t);
  }, [pathname]);

  return null;
}
