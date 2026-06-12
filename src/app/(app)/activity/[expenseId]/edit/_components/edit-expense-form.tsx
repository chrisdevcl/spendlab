"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseWithDetails, GroupWithMembers } from "@/types";
import type { Profile } from "@/types/database.types";
import { formatCLP } from "@/lib/utils/currency";
import { updateExpense } from "../../actions";
import styles from "./edit-expense-form.module.css";

interface Props {
  expense: ExpenseWithDetails;
  allGroups: GroupWithMembers[];
  userId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number {
  return parseInt(raw.replace(/\D/g, "") || "0", 10);
}

function formatAmountDisplay(n: number): string {
  if (n === 0) return "$0";
  return formatCLP(n);
}

function sameMemberSet(a: Profile[], b: Profile[]): boolean {
  if (a.length !== b.length) return false;
  const bIds = new Set(b.map((m) => m.id));
  return a.every((m) => bIds.has(m.id));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditExpenseForm({ expense, allGroups, userId }: Props) {
  const router = useRouter();

  const fallbackMembers = expense.splits.map((s) => s.profile);
  const currentGroup0 = allGroups.find((g) => g.id === expense.group_id);
  const currentMembers0 = currentGroup0?.members ?? fallbackMembers;

  // ── Group selection (only if other groups share the same members) ───────────
  const groupOptions = useMemo(
    () =>
      allGroups.filter(
        (g) => g.id === expense.group_id || sameMemberSet(g.members, currentMembers0)
      ),
    [allGroups, currentMembers0, expense.group_id]
  );
  const canChangeGroup = groupOptions.length > 1;

  const [selectedGroupId, setSelectedGroupId] = useState(expense.group_id);
  const currentGroup = useMemo(
    () => allGroups.find((g) => g.id === selectedGroupId) ?? currentGroup0,
    [allGroups, selectedGroupId, currentGroup0]
  );
  const members = useMemo(() => currentGroup?.members ?? currentMembers0, [currentGroup, currentMembers0]);
  const isSolo = members.length === 1;

  // ── Amount ─────────────────────────────────────────────────────────────────
  const [rawAmount, setRawAmount] = useState(String(expense.amount));
  const amountValue = parseAmount(rawAmount);
  const amountInputRef = useRef<HTMLInputElement>(null);

  function addQuick(n: number) {
    setRawAmount((prev) => String(parseAmount(prev) + n));
  }

  function clearAmount() {
    setRawAmount("0");
    amountInputRef.current?.focus();
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  const [description, setDescription] = useState(expense.description);
  const [date, setDate] = useState<string>(expense.expense_date.slice(0, 10));
  const [paidBy, setPaidBy] = useState<string | null>(expense.paid_by);

  const initialSelected = expense.splits.length
    ? expense.splits.map((s) => s.user_id)
    : members.map((m) => m.id);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelected));

  // Was this expense already personal (no real division)?
  const initialIsShared = expense.paid_by === null
    ? expense.splits.length > 1
    : !(expense.splits.length === 0 || expense.splits.every((s) => s.user_id === expense.paid_by));
  const [isShared, setIsShared] = useState(initialIsShared);

  // A pending (no payer) expense can't be "personal" — force shared.
  const effectiveIsShared = paidBy === null ? true : isShared;

  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function toggleMember(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // ── Split preview ──────────────────────────────────────────────────────────
  const splits = useMemo<Record<string, number>>(() => {
    const selected = members.filter((m) => selectedIds.has(m.id));
    if (!selected.length || amountValue === 0) return {};
    const base      = Math.floor(amountValue / selected.length);
    const remainder = amountValue % selected.length;
    return Object.fromEntries(
      selected.map((m, i) => [m.id, base + (i < remainder ? 1 : 0)])
    );
  }, [amountValue, members, selectedIds]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const canSave = amountValue > 0 && description.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    setError("");

    const effectivePaidBy = isSolo ? (members[0]?.id ?? userId) : paidBy;
    const memberIds = isSolo
      ? members.map((m) => m.id)
      : !effectiveIsShared
        ? [effectivePaidBy as string]
        : Array.from(selectedIds);

    startTransition(async () => {
      const result = await updateExpense(
        expense.id,
        selectedGroupId,
        effectivePaidBy,
        amountValue,
        description,
        memberIds,
        date
      );
      if (result?.error) {
        setError(result.error);
      } else {
        router.replace(`/activity/${expense.id}`);
      }
    });
  }

  useEffect(() => {
    amountInputRef.current?.focus();
  }, []);

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <button
          className={styles.iconBtn}
          onClick={() => router.back()}
          aria-label="Cerrar"
          disabled={isPending}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className={styles.title}>Editar gasto</h1>
      </header>

      <div className={styles.scrollArea}>

        {/* ── Amount card ─────────────────────────────────────────────── */}
        <div className={styles.amountSection}>
          <div className={styles.amountCard}>
            <p className={styles.amountLabel}>Monto total</p>
            <div
              className={styles.amountDisplay}
              onClick={() => amountInputRef.current?.focus()}
            >
              {formatAmountDisplay(amountValue)}
            </div>
            {/* Hidden input receives keyboard entry */}
            <input
              ref={amountInputRef}
              className={styles.hiddenInput}
              type="text"
              inputMode="numeric"
              value={rawAmount === "0" ? "" : rawAmount}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setRawAmount(digits || "0");
                if (error) setError("");
              }}
              aria-label="Monto del gasto"
            />
            <div className={styles.quickRow}>
              {[1000, 5000, 10000].map((n) => (
                <button
                  key={n}
                  className={styles.quickChip}
                  onClick={() => addQuick(n)}
                  disabled={isPending}
                >
                  +{formatCLP(n)}
                </button>
              ))}
              {amountValue > 0 && (
                <button
                  className={`${styles.quickChip} ${styles.quickClear}`}
                  onClick={clearAmount}
                  disabled={isPending}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Group selector (only if other groups share the same members) ── */}
        {canChangeGroup && (
          <div className={styles.formSection}>
            <p className={styles.sectionLabel}>Grupo</p>
            <div className={styles.groupSelectWrap}>
              <span className={styles.groupSelectValue}>{currentGroup?.name ?? ""}</span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <select
                className={styles.groupSelectOverlay}
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(e.target.value)}
                disabled={isPending}
                aria-label="Seleccionar grupo"
              >
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ── Description ─────────────────────────────────────────────── */}
        <div className={styles.formSection}>
          <p className={styles.sectionLabel}>Descripción</p>
          <input
            className={styles.descInput}
            type="text"
            placeholder="Ej: Supermercado Jumbo"
            value={description}
            maxLength={100}
            disabled={isPending}
            onChange={(e) => {
              setDescription(e.target.value);
              if (error) setError("");
            }}
          />
        </div>

        {/* ── Date ────────────────────────────────────────────────────── */}
        <div className={styles.formSection}>
          <p className={styles.sectionLabel}>Fecha</p>
          <input
            className={styles.dateInput}
            type="date"
            value={date}
            max={`${new Date().getFullYear() + 1}-12-31`}
            disabled={isPending}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {/* ── Payer + split type + splits (hidden in solo mode) ───────── */}
        {!isSolo && (
          <>
            {/* ¿Quién pagó? */}
            <div className={styles.formSection}>
              <p className={styles.sectionLabel}>¿Quién pagó?</p>
              <div className={styles.payerGrid}>
                {members.map((m) => (
                  <button
                    key={m.id}
                    className={`${styles.payerBtn} ${paidBy === m.id ? styles.payerBtnActive : ""}`}
                    onClick={() => setPaidBy(m.id)}
                    disabled={isPending}
                  >
                    {m.display_name.split(" ")[0]}
                  </button>
                ))}
                <button
                  className={`${styles.payerBtn} ${paidBy === null ? styles.payerBtnActive : ""}`}
                  onClick={() => setPaidBy(null)}
                  disabled={isPending}
                >
                  Pago pendiente
                </button>
              </div>
            </div>

            {/* Tipo de gasto */}
            {paidBy !== null && (
              <div className={styles.formSection}>
                <p className={styles.sectionLabel}>Tipo de gasto</p>
                <div className={styles.payerGrid}>
                  <button
                    className={`${styles.payerBtn} ${!isShared ? styles.payerBtnActive : ""}`}
                    onClick={() => setIsShared(false)}
                    disabled={isPending}
                  >
                    Personal
                  </button>
                  <button
                    className={`${styles.payerBtn} ${isShared ? styles.payerBtnActive : ""}`}
                    onClick={() => setIsShared(true)}
                    disabled={isPending}
                  >
                    Dividir
                  </button>
                </div>
              </div>
            )}

            {/* Dividir entre */}
            {effectiveIsShared ? (
              <div className={styles.formSection}>
                <p className={styles.sectionLabel}>Dividir entre</p>
                <div className={styles.memberList}>
                  {members.map((m) => {
                    const checked  = selectedIds.has(m.id);
                    const shareAmt = splits[m.id];
                    const initials = (m.display_name[0] ?? "?").toUpperCase();
                    return (
                      <div
                        key={m.id}
                        className={styles.memberRow}
                        onClick={() => !isPending && toggleMember(m.id)}
                      >
                        <div className={styles.memberAvatar}>{initials}</div>
                        <p className={styles.memberName}>{m.display_name.split(" ")[0]}</p>
                        <p className={`${styles.memberShare} ${checked ? styles.memberShareActive : ""}`}>
                          {checked && shareAmt != null ? formatCLP(shareAmt) : "—"}
                        </p>
                        <div className={`${styles.checkbox} ${checked ? styles.checkboxOn : ""}`}>
                          {checked && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={styles.personalNote}>Gasto personal — sin división ni deudas.</p>
            )}
          </>
        )}

        {error && <p className={styles.errorMsg}>{error}</p>}
      </div>

      {/* ── Save footer ───────────────────────────────────────────────── */}
      <div className={styles.saveFooter}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={!canSave || isPending}
        >
          {isPending ? (
            "Guardando…"
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8.5l4 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Guardar cambios
            </>
          )}
        </button>
      </div>
    </div>
  );
}
