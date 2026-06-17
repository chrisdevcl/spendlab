"use client";

import { IconBtn } from "@/components/icon-btn/icon-btn";
import styles from "./header-actions.module.css";

export const iconBtnClass = styles.iconBtn;

interface Props {
  hasGroups: boolean;
  notifBadge: number;
  onNewGroup: () => void;
  onNewExpense: () => void;
  onNotif: () => void;
  children?: React.ReactNode;
}

export function HeaderActions({ hasGroups, notifBadge, onNewGroup, onNewExpense, onNotif, children }: Props) {
  return (
    <div className={styles.wrap}>
      {children}
      <IconBtn label="Nuevo grupo" className={styles.iconBtn} onClick={onNewGroup}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="5.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1 17c0-3 2.2-4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="11.5" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 17c0-3 2.2-4.5 4.5-4.5s4.5 1.5 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M17 2.5v4M15 4.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </IconBtn>
      {hasGroups && (
        <IconBtn label="Añadir gasto" className={styles.iconBtn} onClick={onNewExpense}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3" y="2" width="14" height="17" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 7h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M13 14.5v4M11 16.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </IconBtn>
      )}
      <IconBtn label="Notificaciones" tipAlign="right" className={styles.bellBtn} onClick={onNotif}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2a6 6 0 0 1 6 6c0 3.5 1 5 1.5 5.5h-15C3 13 4 11.5 4 8a6 6 0 0 1 6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        {notifBadge > 0 && <span className={styles.bellBadge}>{notifBadge}</span>}
      </IconBtn>
    </div>
  );
}
