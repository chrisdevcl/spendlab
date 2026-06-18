import PushSetup from "@/components/push-setup";
import BottomNavWrapper from "@/components/layout/bottom-nav-wrapper";
import styles from "./layout.module.css";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <PushSetup />
      <main className={styles.main}>{children}</main>
      <BottomNavWrapper />
    </div>
  );
}
