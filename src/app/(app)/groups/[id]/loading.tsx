import s from "@/app/skeleton.module.css";

export default function GroupDetailLoading() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.iconPlaceholder} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <div className={s.lineMd} style={{ width: "50%" }} />
          <div className={s.lineSm} style={{ width: "35%" }} />
        </div>
        <div className={s.iconPlaceholder} style={{ width: 60, borderRadius: 9999 }} />
      </header>
      <div className={s.content}>
        {/* balance card */}
        <div className={s.card} style={{ padding: "1.375rem 1.5rem", gap: "0.75rem", borderRadius: 20, marginBottom: "0.625rem" }}>
          <div className={s.lineSm} style={{ width: "35%" }} />
          <div className={s.lineLg} style={{ width: "55%", height: 28 }} />
          <div className={s.lineSm} style={{ width: "50%" }} />
        </div>
        {/* expense rows */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={s.card}>
            <div className={s.row}>
              <div className={s.lineMd} />
              <div className={s.lineSm} style={{ width: 70 }} />
            </div>
            <div className={s.lineSm} style={{ width: "40%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
