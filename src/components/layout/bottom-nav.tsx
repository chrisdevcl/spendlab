"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./bottom-nav.module.css";

function IconGroups({ active }: { active: boolean }) {
  const weight = active ? 2 : 1.5;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  );
}

function IconActivity({ active }: { active: boolean }) {
  const weight = active ? 2 : 1.5;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="5" cy="6" r="2" />
      <line x1="10" y1="6" x2="21" y2="6" />
      <circle cx="5" cy="12" r="2" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <circle cx="5" cy="18" r="2" />
      <line x1="10" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  const weight = active ? 2 : 1.5;
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.582-7 8-7s8 3 8 7" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/groups", label: "Grupos", Icon: IconGroups },
  { href: "/activity", label: "Actividad", Icon: IconActivity },
  { href: "/profile", label: "Perfil", Icon: IconProfile },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Navegación principal">
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`${styles.item}${active ? ` ${styles.active}` : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon active={active} />
            <span className={styles.label}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
