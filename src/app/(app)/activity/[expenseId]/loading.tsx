import s from "@/app/skeleton.module.css";

export default function ExpenseDetailLoading() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.iconPlaceholder} />
        <div className={s.lineMd} style={{ flex: 1 }} />
        <div className={s.iconPlaceholder} />
      </header>
      <div className={s.content}>
        {/* hero */}
        <div className={s.card} style={{ alignItems: "center", gap: "0.75rem", padding: "2rem 1.5rem", borderRadius: 20 }}>
          <div className={s.lineLg} style={{ width: "45%", height: 32 }} />
          <div className={s.lineMd} style={{ width: "60%" }} />
          <div className={s.lineSm} style={{ width: 80, borderRadius: 9999 }} />
        </div>
        {/* meta card */}
        <div className={s.card} style={{ gap: "0.875rem" }}>
          <div className={s.row}>
            <div className={s.lineSm} style={{ width: 50 }} />
            <div className={s.lineSm} style={{ width: "45%" }} />
          </div>
          <div className={s.row}>
            <div className={s.lineSm} style={{ width: 40 }} />
            <div className={s.lineSm} style={{ width: "30%" }} />
          </div>
        </div>
        {/* splits */}
        {[1, 2].map((i) => (
          <div key={i} className={s.card} style={{ flexDirection: "row", alignItems: "center", gap: "0.75rem" }}>
            <div className={s.iconPlaceholder} style={{ borderRadius: 9999, width: 36, height: 36 }} />
            <div className={s.lineMd} style={{ flex: 1 }} />
            <div className={s.lineSm} style={{ width: 60 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
