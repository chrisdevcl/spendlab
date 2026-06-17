"use client";

import { useState, useRef, type ButtonHTMLAttributes } from "react";
import styles from "./icon-btn.module.css";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tipAlign?: "center" | "right";
}

export function IconBtn({ label, tipAlign = "center", children, onMouseEnter, onMouseLeave, onTouchStart, ...rest }: Props) {
  const [tip, setTip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() { setTip(true); }
  function hide() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setTip(false);
  }

  function handleTouch(e: React.TouchEvent<HTMLButtonElement>) {
    show();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(hide, 1200);
    onTouchStart?.(e);
  }

  return (
    <div className={styles.wrap}>
      <button
        aria-label={label}
        onMouseEnter={(e) => { show(); onMouseEnter?.(e); }}
        onMouseLeave={(e) => { hide(); onMouseLeave?.(e); }}
        onTouchStart={handleTouch}
        {...rest}
      >
        {children}
      </button>
      {tip && (
        <span
          className={`${styles.tooltip} ${tipAlign === "right" ? styles.tooltipRight : ""}`}
          role="tooltip"
        >
          {label}
        </span>
      )}
    </div>
  );
}
