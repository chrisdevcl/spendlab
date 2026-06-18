import { Suspense } from "react";
import PushSetup from "@/components/push-setup";
import BottomNavWrapper from "@/components/layout/bottom-nav-wrapper";
import styles from "./layout.module.css";

function NavFallback() {
  return (
    <div style={{
      height: 72,
      flexShrink: 0,
      borderTop: "1px solid var(--color-border)",
      background: "var(--color-bg-surface)",
    }} />
  );
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <PushSetup />
      <main className={styles.main}>{children}</main>
      <Suspense fallback={<NavFallback />}>
        <BottomNavWrapper />
      </Suspense>
    </div>
  );
}
