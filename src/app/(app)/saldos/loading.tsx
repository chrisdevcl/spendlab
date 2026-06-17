import s from "@/app/skeleton.module.css";

export default function SaldosLoading() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.lineLg} style={{ width: 90 }} />
      </header>
      <div className={s.content}>
        <div className={s.card} style={{ height: 96 }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className={s.card}>
            <div className={s.row}>
              <div className={s.lineMd} />
              <div className={s.lineSm} style={{ width: 80 }} />
            </div>
            <div className={s.lineSm} style={{ width: "40%" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
