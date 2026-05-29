import s from "@/app/skeleton.module.css";

export default function ProfileLoading() {
  return (
    <div className={s.page}>
      <div className={s.content}>
        {/* avatar + name */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "2rem 0 1.75rem", gap: "0.75rem" }}>
          <div className={s.bone} style={{ width: 80, height: 80, borderRadius: 9999 }} />
          <div className={s.lineMd} style={{ width: 140 }} />
          <div className={s.lineSm} style={{ width: 180 }} />
        </div>
        {/* stats row */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={s.card} style={{ flex: 1, alignItems: "center", gap: "0.5rem" }}>
              <div className={s.lineLg} style={{ width: "60%", height: 22 }} />
              <div className={s.lineSm} style={{ width: "70%" }} />
            </div>
          ))}
        </div>
        {/* menu rows */}
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={s.card} style={{ marginBottom: "0.5rem", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div className={s.lineMd} style={{ width: "50%" }} />
            <div className={s.bone} style={{ width: 16, height: 16, borderRadius: 4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
