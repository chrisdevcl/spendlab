import { createClient } from "@/lib/supabase/server";
import { calculateEqualSplits } from "@/lib/utils/splits";
import type { Expense, ExpenseSplit, Settlement } from "@/types/database.types";
import type { ExpenseWithDetails } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Read ────────────────────────────────────────────────────────────────────

export async function getGroupExpenses(
  groupId: string
): Promise<ExpenseWithDetails[] | null> {
  try {
    const supabase = await createClient();

    // 1. Fetch the group (needed in ExpenseWithDetails)
    const { data: group, error: gErr } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .maybeSingle();

    if (gErr || !group) {
      if (gErr) console.error("[getGroupExpenses] group error:", gErr.message);
      return null;
    }

    // 2. Fetch expenses ordered by date then created_at
    const { data: expenses, error: eErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (eErr) {
      console.error("[getGroupExpenses] expenses error:", eErr.message);
      return null;
    }
    if (!expenses?.length) return [];

    // 3. Batch-fetch splits + profiles in 2 queries
    const expenseIds = expenses.map((e) => e.id);
    const { data: allSplits } = await supabase
      .from("expense_splits")
      .select("*")
      .in("expense_id", expenseIds);

    const payerIds = [...new Set(expenses.map((e) => e.paid_by).filter((id): id is string => id !== null))];
    const splitUserIds = [
      ...new Set((allSplits ?? []).map((s) => s.user_id)),
    ];
    const allUserIds = [...new Set([...payerIds, ...splitUserIds])];

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", allUserIds);

    const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

    const splitsByExpense = new Map<string, ExpenseSplit[]>();
    (allSplits ?? []).forEach((s) => {
      const arr = splitsByExpense.get(s.expense_id) ?? [];
      arr.push(s);
      splitsByExpense.set(s.expense_id, arr);
    });

    // 4. Assemble (payments not loaded here — use getExpense for detail view)
    return expenses.map((expense) => ({
      ...expense,
      group,
      payer: expense.paid_by ? profileMap.get(expense.paid_by) ?? null : null,
      splits: (splitsByExpense.get(expense.id) ?? []).map((split) => ({
        ...split,
        profile: profileMap.get(split.user_id)!,
        payments: [],
      })),
    }));
  } catch (err) {
    console.error("[getGroupExpenses] unexpected error:", err);
    return null;
  }
}

export async function getExpense(
  expenseId: string
): Promise<ExpenseWithDetails | null> {
  try {
    const supabase = await createClient();

    const { data: expense, error: eErr } = await supabase
      .from("expenses")
      .select("*")
      .eq("id", expenseId)
      .single();

    if (eErr || !expense) {
      console.error("[getExpense] error:", eErr?.message);
      return null;
    }

    // Parallel: group + payer (if set) + splits
    const [{ data: group }, payerResult, { data: splits }] = await Promise.all([
      supabase.from("groups").select("*").eq("id", expense.group_id).single(),
      expense.paid_by
        ? supabase.from("profiles").select("*").eq("id", expense.paid_by).single()
        : Promise.resolve({ data: null }),
      supabase.from("expense_splits").select("*").eq("expense_id", expenseId),
    ]);

    const payer = payerResult.data ?? null;

    if (!group) {
      console.error("[getExpense] missing group");
      return null;
    }

    // Batch-fetch split profiles + payment history
    const splitIds     = (splits ?? []).map((s) => s.id);
    const splitUserIds = [...new Set((splits ?? []).map((s) => s.user_id))];

    const [{ data: splitProfiles }, { data: splitPayments }] = await Promise.all([
      splitUserIds.length
        ? supabase.from("profiles").select("*").in("id", splitUserIds)
        : Promise.resolve({ data: [] }),
      splitIds.length
        ? supabase.from("split_payments").select("*").in("split_id", splitIds).order("paid_at", { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap  = new Map((splitProfiles  ?? []).map((p) => [p.id, p]));
    const paymentsMap = new Map<string, typeof splitPayments>();
    for (const p of splitPayments ?? []) {
      const arr = paymentsMap.get(p.split_id) ?? [];
      arr.push(p);
      paymentsMap.set(p.split_id, arr);
    }

    return {
      ...expense,
      group,
      payer,
      splits: (splits ?? []).map((split) => ({
        ...split,
        profile: profileMap.get(split.user_id)!,
        payments: paymentsMap.get(split.id) ?? [],
      })),
    };
  } catch (err) {
    console.error("[getExpense] unexpected error:", err);
    return null;
  }
}

export async function getGroupSplits(
  groupId: string
): Promise<ExpenseSplit[] | null> {
  try {
    const supabase = await createClient();

    const { data: expenses, error: eErr } = await supabase
      .from("expenses")
      .select("id")
      .eq("group_id", groupId);

    if (eErr) {
      console.error("[getGroupSplits] expenses error:", eErr.message);
      return null;
    }
    if (!expenses?.length) return [];

    const expenseIds = expenses.map((e) => e.id);
    const { data: splits, error: sErr } = await supabase
      .from("expense_splits")
      .select("*")
      .in("expense_id", expenseIds);

    if (sErr) {
      console.error("[getGroupSplits] splits error:", sErr.message);
      return null;
    }
    return splits ?? [];
  } catch (err) {
    console.error("[getGroupSplits] unexpected error:", err);
    return null;
  }
}

export async function getGroupSettlements(
  groupId: string
): Promise<Settlement[] | null> {
  try {
    const supabase = await createClient();

    const { data: settlements, error } = await supabase
      .from("settlements")
      .select("*")
      .eq("group_id", groupId)
      .order("settled_at", { ascending: false });

    if (error) {
      console.error("[getGroupSettlements] error:", error.message);
      return null;
    }
    return settlements ?? [];
  } catch (err) {
    console.error("[getGroupSettlements] unexpected error:", err);
    return null;
  }
}

export async function getAllUserExpenses(
  userId: string
): Promise<ExpenseWithDetails[] | null> {
  try {
    const supabase = await createClient();

    // 1. User's groups
    const { data: memberships, error: mErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (mErr) {
      console.error("[getAllUserExpenses] memberships error:", mErr.message);
      return null;
    }
    if (!memberships?.length) return [];

    const groupIds = memberships.map((m) => m.group_id);

    // 2. All expenses across those groups
    const { data: expenses, error: eErr } = await supabase
      .from("expenses")
      .select("*")
      .in("group_id", groupIds)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (eErr) {
      console.error("[getAllUserExpenses] expenses error:", eErr.message);
      return null;
    }
    if (!expenses?.length) return [];

    // 3. Batch everything in 3 more queries
    const expenseIds = expenses.map((e) => e.id);

    const [
      { data: groups },
      { data: allSplits },
    ] = await Promise.all([
      supabase.from("groups").select("*").in("id", groupIds),
      supabase.from("expense_splits").select("*").in("expense_id", expenseIds),
    ]);

    const payerIds = [...new Set(expenses.map((e) => e.paid_by).filter((id): id is string => id !== null))];
    const splitUserIds = [
      ...new Set((allSplits ?? []).map((s) => s.user_id)),
    ];
    const allUserIds = [...new Set([...payerIds, ...splitUserIds])];

    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", allUserIds);

    const groupMap = new Map((groups ?? []).map((g) => [g.id, g]));
    const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

    const splitsByExpense = new Map<string, ExpenseSplit[]>();
    (allSplits ?? []).forEach((s) => {
      const arr = splitsByExpense.get(s.expense_id) ?? [];
      arr.push(s);
      splitsByExpense.set(s.expense_id, arr);
    });

    return expenses.map((expense) => ({
      ...expense,
      group: groupMap.get(expense.group_id)!,
      payer: expense.paid_by ? profileMap.get(expense.paid_by) ?? null : null,
      splits: (splitsByExpense.get(expense.id) ?? []).map((split) => ({
        ...split,
        profile: profileMap.get(split.user_id)!,
        payments: [],
      })),
    }));
  } catch (err) {
    console.error("[getAllUserExpenses] unexpected error:", err);
    return null;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * After creating a shared expense, auto-offset opposing debts between the same
 * two users in the same group. Only applies to shared expenses (with a payer).
 * Pending expenses are never auto-netted.
 */
async function autoNetSplits(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  groupId: string,
  newExpenseId: string,
  paidBy: string,
  newSplits: { userId: string; amount: number }[]
): Promise<void> {
  const nonPayerSplits = newSplits.filter((s) => s.userId !== paidBy);
  if (!nonPayerSplits.length) return;

  for (const newSplit of nonPayerSplits) {
    const debtorId  = newSplit.userId; // owes paidBy in the new expense
    const creditorId = paidBy;          // is owed in the new expense

    // Find shared expenses in this group where debtorId paid (so creditorId owes debtorId)
    const { data: opposingExpenses } = await supabase
      .from("expenses")
      .select("id")
      .eq("group_id", groupId)
      .eq("paid_by", debtorId)
      .neq("id", newExpenseId);

    const opposingIds = (opposingExpenses ?? []).map((e) => e.id);
    if (!opposingIds.length) continue;

    // Get creditor's unpaid splits in those expenses
    const { data: opposingSplits } = await supabase
      .from("expense_splits")
      .select("id, expense_id, amount, paid_amount")
      .eq("user_id", creditorId)
      .in("expense_id", opposingIds);

    const unpaidOpposing = (opposingSplits ?? []).filter((s) => s.paid_amount < s.amount);
    if (!unpaidOpposing.length) continue;

    // Get the newly created split for this debtor to know its current paid_amount
    const { data: newSplitRow } = await supabase
      .from("expense_splits")
      .select("id, amount, paid_amount")
      .eq("expense_id", newExpenseId)
      .eq("user_id", debtorId)
      .single();

    if (!newSplitRow) continue;

    let newRemaining = newSplitRow.amount - newSplitRow.paid_amount;

    for (const opposing of unpaidOpposing) {
      if (newRemaining <= 0) break;

      const opposingRemaining = opposing.amount - opposing.paid_amount;
      const toNet = Math.min(newRemaining, opposingRemaining);
      if (toNet <= 0) continue;

      const now = new Date().toISOString();

      // Offset creditor's debt in old expense
      await Promise.all([
        supabase.from("expense_splits").update({ paid_amount: opposing.paid_amount + toNet }).eq("id", opposing.id),
        supabase.from("split_payments").insert({ split_id: opposing.id, amount: toNet, paid_at: now }),
      ]);

      // Offset debtor's debt in new expense
      const newPaidAmount = newSplitRow.amount - newRemaining + toNet;
      await Promise.all([
        supabase.from("expense_splits").update({ paid_amount: newPaidAmount }).eq("id", newSplitRow.id),
        supabase.from("split_payments").insert({ split_id: newSplitRow.id, amount: toNet, paid_at: now }),
      ]);

      newRemaining -= toNet;
    }
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

export async function createExpense(
  groupId: string,
  paidBy: string | null,
  createdBy: string,
  amount: number,
  description: string,
  memberIds: string[],
  date?: string
): Promise<Expense | null> {
  try {
    const supabase = await createClient();

    const expenseDate = date ?? new Date().toISOString().slice(0, 10);

    const { data: expense, error: eErr } = await supabase
      .from("expenses")
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        created_by: createdBy,
        amount,
        description,
        expense_date: expenseDate,
      })
      .select()
      .single();

    if (eErr || !expense) {
      console.error("[createExpense] insert error:", eErr?.message);
      return null;
    }

    const splits = calculateEqualSplits(amount, memberIds);
    const { error: sErr } = await supabase.from("expense_splits").insert(
      splits.map((s) => ({
        expense_id: expense.id,
        user_id: s.userId,
        amount: s.amount,
        paid_amount: 0,
      }))
    );

    if (sErr) {
      console.error("[createExpense] splits error:", sErr.message);
      await supabase.from("expenses").delete().eq("id", expense.id);
      return null;
    }

    // Auto-net opposing debts between shared expenses (not pending).
    // For each non-payer split in this expense, check if the payer has an
    // unpaid split going the other way and offset them automatically.
    if (paidBy !== null) {
      await autoNetSplits(supabase, groupId, expense.id, paidBy, splits);
    }

    return expense;
  } catch (err) {
    console.error("[createExpense] unexpected error:", err);
    return null;
  }
}

/**
 * Distributes a payment from `paidBy` to `paidTo` across all unpaid splits
 * in `groupId` where paidBy is the debtor and paidTo is the expense payer.
 * Applies oldest-first. Returns total amount actually applied.
 */
export async function registerGroupPayment(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<{ applied: number; error?: string }> {
  try {
    const supabase = await createClient();

    // 1. Get expenses in this group where paidTo paid, ordered oldest first
    const { data: exps, error: eErr } = await supabase
      .from("expenses")
      .select("id")
      .eq("group_id", groupId)
      .eq("paid_by", paidTo)
      .order("expense_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (eErr) return { applied: 0, error: eErr.message };
    const expenseIds = (exps ?? []).map((e) => e.id);
    if (!expenseIds.length) return { applied: 0 };

    // 2. Get paidBy's splits for those expenses that still have an outstanding balance
    const { data: splits, error: sErr } = await supabase
      .from("expense_splits")
      .select("id, expense_id, amount, paid_amount")
      .eq("user_id", paidBy)
      .in("expense_id", expenseIds);

    if (sErr) return { applied: 0, error: sErr.message };

    // Keep expense date order and filter unpaid
    const unpaid = expenseIds
      .flatMap((eid) => (splits ?? []).filter((s) => s.expense_id === eid))
      .filter((s) => s.paid_amount < s.amount);

    if (!unpaid.length) return { applied: 0 };

    let remaining = amount;
    let applied = 0;

    for (const split of unpaid) {
      if (remaining <= 0) break;
      const toPay = Math.min(remaining, split.amount - split.paid_amount);
      if (toPay <= 0) continue;

      const [{ error: uErr }, { error: iErr }] = await Promise.all([
        supabase.from("expense_splits").update({ paid_amount: split.paid_amount + toPay }).eq("id", split.id),
        supabase.from("split_payments").insert({ split_id: split.id, amount: toPay }),
      ]);

      if (uErr || iErr) {
        console.error("[registerGroupPayment] error:", uErr?.message ?? iErr?.message);
        break;
      }

      remaining -= toPay;
      applied += toPay;
    }

    return { applied };
  } catch (err) {
    console.error("[registerGroupPayment] unexpected error:", err);
    return { applied: 0, error: "Error al registrar el pago" };
  }
}

/**
 * Pays pending (no-payer) expense splits for `userId` in `groupId`, oldest first.
 */
export async function registerPendingPayment(
  groupId: string,
  userId: string,
  amount: number
): Promise<{ applied: number; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: exps, error: eErr } = await supabase
      .from("expenses")
      .select("id")
      .eq("group_id", groupId)
      .is("paid_by", null)
      .order("expense_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (eErr) return { applied: 0, error: eErr.message };
    const expenseIds = (exps ?? []).map((e) => e.id);
    if (!expenseIds.length) return { applied: 0 };

    const { data: splits, error: sErr } = await supabase
      .from("expense_splits")
      .select("id, expense_id, amount, paid_amount")
      .eq("user_id", userId)
      .in("expense_id", expenseIds);

    if (sErr) return { applied: 0, error: sErr.message };

    const unpaid = expenseIds
      .flatMap((eid) => (splits ?? []).filter((s) => s.expense_id === eid))
      .filter((s) => s.paid_amount < s.amount);

    let remaining = amount;
    let applied = 0;

    for (const split of unpaid) {
      if (remaining <= 0) break;
      const toPay = Math.min(remaining, split.amount - split.paid_amount);
      if (toPay <= 0) continue;

      const [{ error: uErr }, { error: iErr }] = await Promise.all([
        supabase.from("expense_splits").update({ paid_amount: split.paid_amount + toPay }).eq("id", split.id),
        supabase.from("split_payments").insert({ split_id: split.id, amount: toPay }),
      ]);

      if (uErr || iErr) { console.error("[registerPendingPayment] error:", uErr?.message ?? iErr?.message); break; }
      remaining -= toPay;
      applied += toPay;
    }

    return { applied };
  } catch (err) {
    console.error("[registerPendingPayment] unexpected error:", err);
    return { applied: 0, error: "Error al registrar el pago" };
  }
}

/**
 * Pays all debts for `userId` in `groupId`:
 * 1. First settles person-to-person debt with `creditorId` (shared expenses).
 * 2. With any remaining amount, pays pending (no-payer) splits.
 */
export async function registerGroupFullPayment(
  groupId: string,
  userId: string,
  creditorId: string | null,
  amount: number
): Promise<{ applied: number; error?: string }> {
  let remaining = amount;
  let applied = 0;

  if (creditorId && remaining > 0) {
    const result = await registerGroupPayment(groupId, userId, creditorId, remaining);
    if (result.error) return { applied, error: result.error };
    remaining -= result.applied;
    applied += result.applied;
  }

  if (remaining > 0) {
    const result = await registerPendingPayment(groupId, userId, remaining);
    if (result.error) return { applied, error: result.error };
    applied += result.applied;
  }

  return { applied };
}

export async function recordSplitPayment(
  splitId: string,
  payAmount: number
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const { data: split, error: rErr } = await supabase
      .from("expense_splits")
      .select("amount, paid_amount")
      .eq("id", splitId)
      .single();

    if (rErr || !split) {
      console.error("[recordSplitPayment] read error:", rErr?.message);
      return false;
    }

    const capped   = Math.min(payAmount, split.amount - split.paid_amount);
    if (capped <= 0) return true; // already fully paid

    const newPaid  = split.paid_amount + capped;

    // Update running total and insert history record in parallel
    const [{ error: uErr }, { error: iErr }] = await Promise.all([
      supabase
        .from("expense_splits")
        .update({ paid_amount: newPaid })
        .eq("id", splitId),
      supabase
        .from("split_payments")
        .insert({ split_id: splitId, amount: capped }),
    ]);

    if (uErr) { console.error("[recordSplitPayment] update error:", uErr.message); return false; }
    if (iErr) { console.error("[recordSplitPayment] history error:", iErr.message); return false; }
    return true;
  } catch (err) {
    console.error("[recordSplitPayment] unexpected error:", err);
    return false;
  }
}

export async function markExpenseAsPaid(
  expenseId: string,
  paidBy: string
): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("expenses")
      .update({ paid_by: paidBy })
      .eq("id", expenseId)
      .is("paid_by", null);
    if (error) {
      console.error("[markExpenseAsPaid] error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[markExpenseAsPaid] unexpected error:", err);
    return false;
  }
}

export async function deleteExpense(expenseId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId);
    if (error) {
      console.error("[deleteExpense] error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteExpense] unexpected error:", err);
    return false;
  }
}
