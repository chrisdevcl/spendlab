import { createClient } from "@/lib/supabase/server";
import { calculateEqualSplits } from "@/lib/utils/splits";
import type { Expense, ExpenseSplit, Settlement } from "@/types/database.types";
import type { ExpenseWithDetails } from "@/types";

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

    // 4. Assemble
    return expenses.map((expense) => ({
      ...expense,
      group,
      payer: expense.paid_by ? profileMap.get(expense.paid_by) ?? null : null,
      splits: (splitsByExpense.get(expense.id) ?? []).map((split) => ({
        ...split,
        profile: profileMap.get(split.user_id)!,
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

    // Batch-fetch split profiles
    const splitUserIds = [...new Set((splits ?? []).map((s) => s.user_id))];
    const { data: splitProfiles } = splitUserIds.length
      ? await supabase.from("profiles").select("*").in("id", splitUserIds)
      : { data: [] };

    const profileMap = new Map((splitProfiles ?? []).map((p) => [p.id, p]));

    return {
      ...expense,
      group,
      payer,
      splits: (splits ?? []).map((split) => ({
        ...split,
        profile: profileMap.get(split.user_id)!,
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
      })),
    }));
  } catch (err) {
    console.error("[getAllUserExpenses] unexpected error:", err);
    return null;
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
      // Rollback: delete the expense (cascade should remove orphan splits if any)
      await supabase.from("expenses").delete().eq("id", expense.id);
      return null;
    }

    return expense;
  } catch (err) {
    console.error("[createExpense] unexpected error:", err);
    return null;
  }
}

export async function createSettlement(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<Settlement | null> {
  try {
    const supabase = await createClient();

    const { data: settlement, error } = await supabase
      .from("settlements")
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        paid_to: paidTo,
        amount,
        settled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[createSettlement] error:", error.message);
      return null;
    }
    return settlement;
  } catch (err) {
    console.error("[createSettlement] unexpected error:", err);
    return null;
  }
}

export async function recordSplitPayment(
  splitId: string,
  payAmount: number
): Promise<boolean> {
  try {
    const supabase = await createClient();

    // Read current values first to cap at split.amount
    const { data: split, error: rErr } = await supabase
      .from("expense_splits")
      .select("amount, paid_amount")
      .eq("id", splitId)
      .single();

    if (rErr || !split) {
      console.error("[recordSplitPayment] read error:", rErr?.message);
      return false;
    }

    const newPaid = Math.min(split.amount, split.paid_amount + payAmount);

    const { error } = await supabase
      .from("expense_splits")
      .update({ paid_amount: newPaid })
      .eq("id", splitId);

    if (error) {
      console.error("[recordSplitPayment] update error:", error.message);
      return false;
    }
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
