import s from "@/app/skeleton.module.css";

export default function GroupsLoading() {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.lineLg} style={{ width: 80 }} />
      </header>
      <div className={s.content}>
        {[1, 2, 3].map((i) => (
          <div key={i} className={s.card}>
            <div className={s.row}>
              <div className={s.lineMd} />
              <div className={s.lineSm} style={{ width: 60 }} />
            </div>
            <div className={s.lineSm} />
          </div>
        ))}
      </div>
    </div>
  );
}
