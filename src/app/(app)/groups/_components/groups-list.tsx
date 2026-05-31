"use client";

import { useState, useRef, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Profile } from "@/types/database.types";
import type { GroupWithMembers, PendingInvitation } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import { createGroup, acceptInvitation, rejectInvitation } from "../actions";
import { createClient } from "@/lib/supabase/client";
import styles from "./groups-list.module.css";

interface Props {
  groups: GroupWithMembers[];
  profile: Profile | null;
  invitations: PendingInvitation[];
}

const GREETINGS = [
  "Hola",       // Español
  "Hello",      // Inglés
  "Ciao",       // Italiano
  "Salut",      // Francés
  "Olá",        // Portugués
  "Hei",        // Noruego / Finlandés
  "Xin chào",   // Vietnamita
  "Merhaba",    // Turco
  "Hallo",      // Alemán / Neerlandés
  "こんにちは",  // Japonés
  "안녕하세요",  // Coreano
  "Привет",     // Ruso
  "Yassas",     // Griego
];

const STORAGE_KEY = "spendlab_greeting_idx";

function nextGreeting(): string {
  if (typeof window === "undefined") return GREETINGS[0];
  const current = parseInt(localStorage.getItem(STORAGE_KEY) ?? "-1", 10);
  const next = (current + 1) % GREETINGS.length;
  localStorage.setItem(STORAGE_KEY, String(next));
  return GREETINGS[next];
}

export default function GroupsList({ groups, profile, invitations }: Props) {
  const router = useRouter();
  const [greeting] = useState(nextGreeting);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Supabase Realtime: refresh when a new invitation arrives ──────────────
  const refresh = useCallback(() => router.refresh(), [router]);

  useEffect(() => {
    if (!profile?.email) return;
    const supabase = createClient();
    const channel = supabase
      .channel("groups:invitations")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "group_invitations",
          filter: `invited_email=eq.${profile.email}`,
        },
        () => refresh()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.email, refresh]);

  // ── Web Push: subscribe for background notifications ──────────────────────
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    )
      return;

    // Only subscribe if user has already granted permission
    if (Notification.permission !== "granted") return;

    navigator.serviceWorker.ready
      .then((reg) =>
        reg.pushManager.getSubscription().then((existing) => {
          if (existing) return existing;
          return reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
            ),
          });
        })
      )
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        })
      )
      .catch(() => {/* ignore — push is optional */});
  }, [profile?.id]);

  // ── Push permission request ────────────────────────────────────────────────
  const [pushDismissed, setPushDismissed] = useState(false);
  const [pushPermission, setPushPermission] =
    useState<NotificationPermission | null>(() =>
      typeof window !== "undefined" && "Notification" in window
        ? Notification.permission
        : null
    );

  async function requestPushPermission() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission === "granted") {
      // Trigger subscription
      setPushDismissed(false); // rerun the subscription effect
    }
  }

  const closeModal = useCallback(() => {
    if (isPending) return;
    setIsOpen(false);
    setName("");
    setError("");
  }, [isPending]);

  function openModal() {
    setName("");
    setError("");
    setIsOpen(true);
  }

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, closeModal]);

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("El nombre no puede estar vacío");
      inputRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const result = await createGroup(trimmed);
      if (result.error) {
        setError(result.error);
      } else {
        setIsOpen(false);
        router.refresh();
        if (result.groupId) router.push(`/groups/${result.groupId}`);
      }
    });
  }

  const firstName = profile?.display_name?.split(" ")[0] ?? "tú";
  const hasInvitations = invitations.length > 0;
  const hasGroups = groups.length > 0;
  const isEmpty = !hasInvitations && !hasGroups;

  // Show push prompt only when: notifications supported, not yet granted, not dismissed
  const showPushPrompt =
    !pushDismissed &&
    pushPermission === "default" &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window &&
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div>
          <p className={styles.greetingLabel}>{greeting}</p>
          <h1 className={styles.greeting}>{firstName}</h1>
        </div>
        <button className={styles.btnCreate} onClick={openModal}>
          + Grupo
        </button>
      </header>

      {/* ── Push notification permission prompt ──────────────────── */}
      {showPushPrompt && (
        <div className={styles.pushBanner}>
          <p className={styles.pushBannerText}>
            Activa notificaciones para saber cuando te inviten a un grupo
          </p>
          <div className={styles.pushBannerActions}>
            <button
              className={styles.pushBannerDismiss}
              onClick={() => setPushDismissed(true)}
            >
              Ahora no
            </button>
            <button
              className={styles.pushBannerAccept}
              onClick={requestPushPermission}
            >
              Activar
            </button>
          </div>
        </div>
      )}

      {/* ── Invitations section ───────────────────────────────────── */}
      {hasInvitations && (
        <section className={styles.section}>
          <p className={styles.sectionLabel}>
            INVITACIONES · {invitations.length}
          </p>
          <div className={styles.invList}>
            {invitations.map((inv) => (
              <InvitationCard
                key={inv.id}
                invitation={inv}
                onDone={() => router.refresh()}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Groups section ────────────────────────────────────────── */}
      {hasGroups && (
        <section className={styles.section}>
          <p className={styles.sectionLabel}>TUS GRUPOS</p>
          <ul className={styles.list}>
            {groups.map((group) => (
              <li key={group.id}>
                <GroupCard group={group} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Empty state ───────────────────────────────────────────── */}
      {isEmpty && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🗂️</span>
          <p className={styles.emptyTitle}>Sin grupos todavía</p>
          <p className={styles.emptyBody}>
            Crea tu primer grupo para empezar a dividir gastos con otros.
          </p>
        </div>
      )}

      {/* ── Create-group modal ────────────────────────────────────── */}
      {isOpen && (
        <div
          className={styles.backdrop}
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo grupo"
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <p className={styles.modalTitle}>Nuevo grupo</p>
            <input
              ref={inputRef}
              className={styles.modalInput}
              type="text"
              placeholder="Nombre del grupo"
              value={name}
              maxLength={60}
              disabled={isPending}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            {error && <p className={styles.modalError}>{error}</p>}
            <div className={styles.modalActions}>
              <button
                className={styles.btnCancel}
                onClick={closeModal}
                disabled={isPending}
              >
                Cancelar
              </button>
              <button
                className={styles.btnConfirm}
                onClick={handleCreate}
                disabled={isPending || !name.trim()}
              >
                {isPending ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invitation card ────────────────────────────────────────────────────────

function InvitationCard({
  invitation,
  onDone,
}: {
  invitation: PendingInvitation;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [invError, setInvError] = useState("");

  function handleAccept() {
    setInvError("");
    startTransition(async () => {
      const result = await acceptInvitation(invitation.id);
      if (result.error) {
        setInvError(result.error);
      } else {
        onDone();
      }
    });
  }

  function handleReject() {
    setInvError("");
    startTransition(async () => {
      const result = await rejectInvitation(invitation.id, invitation.group_id);
      if (result.error) {
        setInvError(result.error);
      } else {
        onDone();
      }
    });
  }

  const memberLabel =
    invitation.member_count === 1
      ? "1 integrante"
      : `${invitation.member_count} integrantes`;

  return (
    <div className={styles.invCard}>
      <div className={styles.invHeader}>
        <p className={styles.invGroupName}>{invitation.group_name}</p>
        <span className={styles.invBadge}>Pendiente</span>
      </div>
      <p className={styles.invMeta}>
        Te invitó {invitation.inviter_name} · {memberLabel}
      </p>
      {invError && <p className={styles.invError}>{invError}</p>}
      <div className={styles.invActions}>
        <button
          className={styles.btnReject}
          onClick={handleReject}
          disabled={isPending}
        >
          Rechazar
        </button>
        <button
          className={styles.btnAccept}
          onClick={handleAccept}
          disabled={isPending}
        >
          {isPending ? "…" : "Aceptar"}
        </button>
      </div>
    </div>
  );
}

// ── Group card ─────────────────────────────────────────────────────────────

function GroupCard({ group }: { group: GroupWithMembers }) {
  const count = group.members.length;

  return (
    <Link href={`/groups/${group.id}`} className={styles.card}>
      <div className={styles.info}>
        <p className={styles.groupName}>{group.name}</p>
        <p className={styles.groupMeta}>
          {count === 1 ? "Solo tú" : `${count} integrantes`}
        </p>
      </div>

      <BalanceChip balance={group.balance} />

      {/* Chevron */}
      <svg
        className={styles.cardChevron}
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M6 3l5 5-5 5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

// ── Utility: convert VAPID public key to Uint8Array ───────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// ── Balance chip ───────────────────────────────────────────────────────────

function BalanceChip({ balance }: { balance: number }) {
  if (balance === 0) {
    return <span className={`${styles.chip} ${styles.chipNeutral}`}>Sin deudas</span>;
  }
  if (balance > 0) {
    return (
      <span className={`${styles.chip} ${styles.chipPositive}`}>
        +{formatCLP(balance)}
      </span>
    );
  }
  return (
    <span className={`${styles.chip} ${styles.chipNegative}`}>
      {formatCLP(balance)}
    </span>
  );
}
