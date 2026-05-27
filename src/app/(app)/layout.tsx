import BottomNav from "@/components/layout/bottom-nav";
import styles from "./layout.module.css";

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
