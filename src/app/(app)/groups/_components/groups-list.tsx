"use client";

import { useState, useRef, useTransition, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Profile } from "@/types/database.types";
import type { GroupWithMembers, PendingInvitation, ExpenseWithDetails } from "@/types";
import { formatCLP } from "@/lib/utils/currency";
import BalanceCard from "@/components/balance-card/balance-card";
import { HeaderActions } from "@/components/header-actions/header-actions";
import { NewGroupModal } from "@/components/modals/new-group-modal";
import { GroupPickerModal } from "@/components/modals/group-picker-modal";
import { NotificationsModal } from "@/components/modals/notifications-modal";
import {
  acceptInvitation,
  rejectInvitation,
  inviteMemberToGroup,
  deleteGroup as deleteGroupAction,
  renameGroup as renameGroupAction,
  fetchGroupExpenses,
} from "../actions";
import { createClient } from "@/lib/supabase/client";
import styles from "./groups-list.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1);
  const month = date.toLocaleDateString("es-CL", { month: "long" });
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`;
}

function groupByDate(expenses: ExpenseWithDetails[]): { label: string; expenses: ExpenseWithDetails[] }[] {
  const ordered: string[] = [];
  const map = new Map<string, ExpenseWithDetails[]>();
  for (const expense of expenses) {
    const [y, m, d] = expense.expense_date.slice(0, 10).split("-");
    const label = `${d}/${m}/${y}`;
    if (!map.has(label)) { ordered.push(label); map.set(label, []); }
    map.get(label)!.push(expense);
  }
  return ordered.map((label) => ({ label, expenses: map.get(label)! }));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  groups: GroupWithMembers[];
  profile: Profile | null;
  invitations: PendingInvitation[];
  userId: string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GroupsList({ groups, profile, invitations, userId }: Props) {
  const router = useRouter();

  // ── Group detail modal ─────────────────────────────────────────────────────
  const [selectedGroup, setSelectedGroup] = useState<GroupWithMembers | null>(null);

  // ── Expense group picker ───────────────────────────────────────────────────
  const [expenseGroupPickerOpen, setExpenseGroupPickerOpen] = useState(false);

  // ── ⋯ Action sheet ────────────────────────────────────────────────────────
  const [menuGroup, setMenuGroup] = useState<GroupWithMembers | null>(null);

  // ── New group modal ────────────────────────────────────────────────────────
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  // ── Invite modal ───────────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [isPendingInvite, startInviteTransition] = useTransition();
  const inviteInputRef = useRef<HTMLInputElement>(null);

  function openInvite(groupId: string) {
    setInviteGroupId(groupId); setInviteEmail(""); setInviteError(""); setInviteSuccess(false); setInviteOpen(true);
  }
  const closeInvite = useCallback(() => { if (isPendingInvite) return; setInviteOpen(false); }, [isPendingInvite]);

  useEffect(() => { if (inviteOpen) { const t = setTimeout(() => inviteInputRef.current?.focus(), 60); return () => clearTimeout(t); } }, [inviteOpen]);

  function handleInvite() {
    startInviteTransition(async () => {
      const result = await inviteMemberToGroup(inviteGroupId, inviteEmail);
      if (result.error) { setInviteError(result.error); }
      else { setInviteSuccess(true); setTimeout(() => setInviteOpen(false), 1500); }
    });
  }

  // ── Rename modal ───────────────────────────────────────────────────────────
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameGroupId, setRenameGroupId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState("");
  const [isPendingRename, startRenameTransition] = useTransition();
  const renameInputRef = useRef<HTMLInputElement>(null);

  function openRename(groupId: string, currentName: string) {
    setRenameGroupId(groupId); setRenameValue(currentName); setRenameError(""); setRenameOpen(true);
  }
  useEffect(() => { if (renameOpen) { const t = setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select(); }, 60); return () => clearTimeout(t); } }, [renameOpen]);

  function handleRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenameError("El nombre no puede estar vacío"); return; }
    startRenameTransition(async () => {
      const result = await renameGroupAction(renameGroupId, trimmed);
      if (result.error) { setRenameError(result.error); }
      else { setRenameOpen(false); router.refresh(); }
    });
  }

  // ── Delete modal ───────────────────────────────────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState("");
  const [deleteGroupName, setDeleteGroupName] = useState("");
  const [isPendingDelete, startDeleteTransition] = useTransition();

  function openDelete(groupId: string, groupName: string) {
    setDeleteGroupId(groupId); setDeleteGroupName(groupName); setDeleteOpen(true);
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      await deleteGroupAction(deleteGroupId);
      setDeleteOpen(false);
      router.refresh();
    });
  }

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  const refresh = useCallback(() => router.refresh(), [router]);

  useEffect(() => {
    if (!profile?.email) return;
    const supabase = createClient();
    const channel = supabase
      .channel("groups:invitations")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_invitations", filter: `invited_email=eq.${profile.email}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.email, refresh]);

  // ── Web Push ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (Notification.permission !== "granted") return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription().then((existing) => existing ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY! })))
      .then((sub) => fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) }))
      .catch(() => {});
  }, [profile?.id]);

  // ── Push permission ────────────────────────────────────────────────────────
  const [pushDismissed, setPushDismissed] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : null
  );

  async function requestPushPermission() {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setPushPermission(permission);
  }

  const showPushPrompt = !pushDismissed && pushPermission === "default" && typeof window !== "undefined" && "Notification" in window && "PushManager" in window && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const [notifOpen, setNotifOpen] = useState(false);
  const hasInvitations = invitations.length > 0;
  const hasGroups = groups.length > 0;
  const isEmpty = !hasInvitations && !hasGroups;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <h1 className={styles.heading}>Grupos</h1>
        <HeaderActions
          hasGroups={hasGroups}
          notifBadge={invitations.length}
          onNewGroup={() => setNewGroupOpen(true)}
          onNewExpense={() => setExpenseGroupPickerOpen(true)}
          onNotif={() => setNotifOpen(true)}
        />
      </header>

      {/* ── Push banner ─────────────────────────────────────────────────── */}
      {showPushPrompt && (
        <div className={styles.pushBanner}>
          <p className={styles.pushBannerText}>Activa notificaciones para saber cuando te inviten a un grupo</p>
          <div className={styles.pushBannerActions}>
            <button className={styles.pushBannerDismiss} onClick={() => setPushDismissed(true)}>Ahora no</button>
            <button className={styles.pushBannerAccept} onClick={requestPushPermission}>Activar</button>
          </div>
        </div>
      )}

      {/* ── Groups list ─────────────────────────────────────────────────── */}
      {hasGroups && (
        <ul className={styles.list}>
          {groups.map((group) => (
            <li key={group.id}>
              <GroupCard
                group={group}
                onOpen={() => setSelectedGroup(group)}
                onMenu={() => setMenuGroup(group)}
              />
            </li>
          ))}
        </ul>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {isEmpty && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🗂️</span>
          <p className={styles.emptyTitle}>Sin grupos todavía</p>
          <p className={styles.emptyBody}>Crea tu primer grupo para empezar a dividir gastos con otros.</p>
        </div>
      )}

      {/* ── Group detail modal ───────────────────────────────────────────── */}
      {selectedGroup && (
        <GroupDetailModal
          group={selectedGroup}
          userId={userId}
          onClose={() => setSelectedGroup(null)}
        />
      )}

      {/* ── ⋯ Action sheet ──────────────────────────────────────────────── */}
      {menuGroup && (
        <GroupActionSheet
          group={menuGroup}
          userId={userId}
          onClose={() => setMenuGroup(null)}
          onInvite={() => { const g = menuGroup; setMenuGroup(null); openInvite(g.id); }}
          onRename={() => { const g = menuGroup; setMenuGroup(null); openRename(g.id, g.name); }}
          onDelete={() => { const g = menuGroup; setMenuGroup(null); openDelete(g.id, g.name); }}
        />
      )}

      {/* ── Invite modal ─────────────────────────────────────────────────── */}
      {inviteOpen && (
        <div className={styles.backdrop} onClick={closeInvite} role="dialog" aria-modal="true" aria-label="Invitar integrante">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            {inviteSuccess ? (
              <div className={styles.inviteSuccess}>
                <p className={styles.successIcon}>✓</p>
                <p className={styles.modalTitle}>Invitación enviada</p>
              </div>
            ) : (
              <>
                <div className={styles.modalHeader}>
                  <p className={styles.modalTitle}>Invitar integrante</p>
                  <button className={styles.closeBtn} onClick={closeInvite} aria-label="Cerrar" disabled={isPendingInvite}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
                <input
                  ref={inviteInputRef}
                  className={styles.modalInput}
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={inviteEmail}
                  maxLength={254}
                  disabled={isPendingInvite}
                  onChange={(e) => { setInviteEmail(e.target.value); if (inviteError) setInviteError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                />
                {inviteError && <p className={styles.modalError}>{inviteError}</p>}
                <div className={styles.modalActions}>
                  <button className={styles.btnCancel} onClick={closeInvite} disabled={isPendingInvite}>Cancelar</button>
                  <button className={styles.btnConfirm} onClick={handleInvite} disabled={isPendingInvite || !inviteEmail.trim()}>
                    {isPendingInvite ? "Enviando…" : "Invitar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Rename modal ─────────────────────────────────────────────────── */}
      {renameOpen && (
        <div className={styles.backdrop} onClick={() => { if (!isPendingRename) setRenameOpen(false); }} role="dialog" aria-modal="true" aria-label="Renombrar grupo">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>Renombrar grupo</p>
              <button className={styles.closeBtn} onClick={() => setRenameOpen(false)} aria-label="Cerrar" disabled={isPendingRename}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <input
              ref={renameInputRef}
              className={styles.modalInput}
              type="text"
              placeholder="Nombre del grupo"
              value={renameValue}
              maxLength={60}
              disabled={isPendingRename}
              onChange={(e) => { setRenameValue(e.target.value); if (renameError) setRenameError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
            {renameError && <p className={styles.modalError}>{renameError}</p>}
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setRenameOpen(false)} disabled={isPendingRename}>Cancelar</button>
              <button className={styles.btnConfirm} onClick={handleRename} disabled={isPendingRename || !renameValue.trim()}>
                {isPendingRename ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ─────────────────────────────────────────────────── */}
      {deleteOpen && (
        <div className={styles.backdrop} onClick={() => { if (!isPendingDelete) setDeleteOpen(false); }} role="dialog" aria-modal="true" aria-label="Eliminar grupo">
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>¿Eliminar grupo?</p>
              <button className={styles.closeBtn} onClick={() => setDeleteOpen(false)} aria-label="Cerrar" disabled={isPendingDelete}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            <p className={styles.modalSub}>Se eliminarán todos los gastos y datos de &ldquo;{deleteGroupName}&rdquo;. Esta acción no se puede deshacer.</p>
            <div className={styles.modalActions}>
              <button className={styles.btnCancel} onClick={() => setDeleteOpen(false)} disabled={isPendingDelete}>Cancelar</button>
              <button className={styles.btnDanger} onClick={handleDelete} disabled={isPendingDelete}>
                {isPendingDelete ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <NewGroupModal open={newGroupOpen} onClose={() => setNewGroupOpen(false)} />

      <GroupPickerModal
        open={expenseGroupPickerOpen}
        onClose={() => setExpenseGroupPickerOpen(false)}
        groups={groups.map((g) => ({ id: g.id, name: g.name }))}
      />

      <NotificationsModal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        isEmpty={!hasInvitations}
      >
        <p className={styles.notifSubLabel}>INVITACIONES · {invitations.length}</p>
        <div className={styles.invList}>
          {invitations.map((inv) => (
            <InvitationCard key={inv.id} invitation={inv} onDone={() => { router.refresh(); setNotifOpen(false); }} />
          ))}
        </div>
      </NotificationsModal>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────────

function GroupCard({ group, onOpen, onMenu }: { group: GroupWithMembers; onOpen: () => void; onMenu: () => void }) {
  const count = group.members.length;
  return (
    <div className={styles.cardWrap}>
      <button className={styles.card} onClick={onOpen}>
        <div className={styles.groupAvatarCircle}>{group.name[0]?.toUpperCase() ?? "G"}</div>
        <div className={styles.info}>
          <p className={styles.groupName}>{group.name}</p>
          <p className={styles.groupMeta}>{count === 1 ? "Solo tú" : `${count} integrantes`}</p>
        </div>
        {group.totalSpent > 0 && (
          <div className={styles.groupRight}>
            <p className={styles.groupAmount}>{formatCLP(group.totalSpent)}</p>
            {!!group.expenseCount && (
              <span className={styles.expenseCountChip}>
                {group.expenseCount} {group.expenseCount === 1 ? "gasto" : "gastos"}
              </span>
            )}
          </div>
        )}
      </button>
      <button className={styles.menuBtn} onClick={onMenu} aria-label={`Opciones de ${group.name}`}>
        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="1.5"/>
          <circle cx="2" cy="8" r="1.5"/>
          <circle cx="2" cy="14" r="1.5"/>
        </svg>
      </button>
    </div>
  );
}

// ── Group detail modal ────────────────────────────────────────────────────────

function GroupDetailModal({ group, onClose }: { group: GroupWithMembers; userId: string; onClose: () => void }) {
  const [expenses, setExpenses] = useState<ExpenseWithDetails[] | null>(null);
  const currentMonthKey = toMonthKey(new Date());

  useEffect(() => {
    fetchGroupExpenses(group.id).then((data) => setExpenses(data ?? []));
  }, [group.id]);

  const availableMonths = useMemo(() => {
    const keys = new Set<string>();
    keys.add(currentMonthKey);
    (expenses ?? []).forEach((e) => keys.add(e.expense_date.slice(0, 7)));
    return [...keys].sort().reverse();
  }, [expenses, currentMonthKey]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  const filteredExpenses = useMemo(
    () => (expenses ?? []).filter((e) => e.expense_date.slice(0, 7) === selectedMonth),
    [expenses, selectedMonth]
  );

  const monthTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const showPicker = availableMonths.length > 1;
  const subtitle = group.members.length === 1 ? "Solo tú" : `${group.members.length} integrantes`;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={group.name}>
      <div className={styles.detailSheet} onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div className={styles.detailHandle} />

        {/* Header */}
        <div className={styles.detailHeader}>
          <div className={styles.detailAvatar}>{group.name[0]?.toUpperCase() ?? "G"}</div>
          <div className={styles.detailGroupInfo}>
            <p className={styles.detailGroupName}>{group.name}</p>
            <p className={styles.detailGroupSub}>{subtitle}</p>
          </div>
          <button className={styles.detailCloseBtn} onClick={onClose} aria-label="Cerrar">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className={styles.detailContent}>
          {expenses === null ? (
            <div className={styles.detailLoading}>Cargando gastos…</div>
          ) : (
            <>
              <BalanceCard
                selectedMonth={selectedMonth}
                availableMonths={availableMonths}
                showPicker={showPicker}
                onMonthChange={setSelectedMonth}
                monthLabel={monthLabel}
                expenseCount={filteredExpenses.length}
                totalAmount={monthTotal}
              />

              <section className={styles.section}>
                {filteredExpenses.length === 0 ? (
                  <div className={styles.emptyExpenses}>
                    <p className={styles.emptyTitle}>Sin gastos este mes</p>
                    <p className={styles.emptySub}>
                      {selectedMonth === currentMonthKey ? "Añade el primer gasto del mes." : "No hubo gastos en este período."}
                    </p>
                  </div>
                ) : (
                  groupByDate(filteredExpenses).map(({ label, expenses: dateExpenses }) => (
                    <div key={label} className={styles.dateGroup}>
                      <p className={styles.dateGroupLabel}>{label}</p>
                      <div className={styles.expenseList}>
                        {dateExpenses.map((expense) => (
                          <Link key={expense.id} href={`/activity/${expense.id}`} onClick={onClose} className={styles.expenseRow}>
                            <div className={styles.expenseLeft}>
                              <p className={styles.expenseDesc}>{expense.description}</p>
                            </div>
                            <div className={styles.expenseRight}>
                              <p className={styles.expenseAmount}>{formatCLP(expense.amount)}</p>
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={styles.expenseChevron}>
                                <path d="M5 2.5l4.5 4.5L5 11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.detailFooter}>
          <Link href={`/groups/${group.id}/expenses/new`} className={styles.addExpenseBtn} onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Añadir gasto
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Group action sheet ────────────────────────────────────────────────────────

function GroupActionSheet({ group, userId, onClose, onInvite, onRename, onDelete }: {
  group: GroupWithMembers;
  userId: string;
  onClose: () => void;
  onInvite: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const isCreator = group.created_by === userId;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={`Opciones de ${group.name}`}>
      <div className={styles.actionSheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.actionSheetHeader}>
          <p className={styles.actionSheetTitle}>{group.name}</p>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>

        <button className={styles.actionSheetItem} onClick={onInvite}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M1.5 14c0-3.038 2.462-5.5 5.5-5.5s5.5 2.462 5.5 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M12.5 2v5M10 4.5h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Invitar integrante
        </button>

        {isCreator && (
          <button className={styles.actionSheetItem} onClick={onRename}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10.5 2.5a1.5 1.5 0 0 1 2.121 0l.879.879a1.5 1.5 0 0 1 0 2.121L5.5 13.5H2.5v-3L10.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M8.5 4.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Renombrar grupo
          </button>
        )}

        {isCreator && (
          <button className={`${styles.actionSheetItem} ${styles.actionSheetItemDanger}`} onClick={onDelete}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2.5 4.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M6 4.5V3h4v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 4.5l.75 9h6.5l.75-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Eliminar grupo
          </button>
        )}

        <div className={styles.actionSheetDivider} />
        <button className={styles.actionSheetCancel} onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Invitation card ───────────────────────────────────────────────────────────

function InvitationCard({ invitation, onDone }: { invitation: PendingInvitation; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [invError, setInvError] = useState("");

  function handleAccept() {
    setInvError("");
    startTransition(async () => {
      const result = await acceptInvitation(invitation.id);
      if (result.error) { setInvError(result.error); } else { onDone(); }
    });
  }

  function handleReject() {
    setInvError("");
    startTransition(async () => {
      const result = await rejectInvitation(invitation.id, invitation.group_id);
      if (result.error) { setInvError(result.error); } else { onDone(); }
    });
  }

  const memberLabel = invitation.member_count === 1 ? "1 integrante" : `${invitation.member_count} integrantes`;

  return (
    <div className={styles.invCard}>
      <div className={styles.invHeader}>
        <p className={styles.invGroupName}>{invitation.group_name}</p>
        <span className={styles.invBadge}>Pendiente</span>
      </div>
      <p className={styles.invMeta}>Te invitó {invitation.inviter_name} · {memberLabel}</p>
      {invError && <p className={styles.invError}>{invError}</p>}
      <div className={styles.invActions}>
        <button className={styles.btnReject} onClick={handleReject} disabled={isPending}>Rechazar</button>
        <button className={styles.btnAccept} onClick={handleAccept} disabled={isPending}>{isPending ? "…" : "Aceptar"}</button>
      </div>
    </div>
  );
}
