"use client";
import dynamic from "next/dynamic";
import styles from "./layout.module.css";

const BottomNav = dynamic(() => import("@/components/layout/bottom-nav"), { ssr: false });

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <main className={styles.main}>{children}</main>
      <BottomNav />
    </div>
  );
}
