import type { Expense, ExpenseSplit } from "@/types/database.types";
import type { Debt, GlobalBalance, ExpenseWithDetails } from "@/types";

/**
 * Net balance for `currentUserId` within a single group.
 * Uses paid_amount on splits — no settlements needed.
 * Positive = others owe you; negative = you owe others.
 */
export function computeGroupBalance(
  expenses: Expense[],
  splits: ExpenseSplit[],
  currentUserId: string
): number {
  const expenseMap = new Map(expenses.map((e) => [e.id, e]));
  let balance = 0;

  for (const expense of expenses) {
    if (expense.paid_by !== null && expense.paid_by === currentUserId) {
      balance += expense.amount;
    }
  }

  for (const split of splits) {
    if (split.user_id === currentUserId) {
      balance -= split.amount;
    }

    const expense = expenseMap.get(split.expense_id);
    if (!expense || expense.paid_by === null) continue;

    if (split.user_id === currentUserId && split.user_id !== expense.paid_by && split.paid_amount > 0) {
      // User paid back part of their debt → balance improves
      balance += split.paid_amount;
    } else if (expense.paid_by === currentUserId && split.user_id !== currentUserId && split.paid_amount > 0) {
      // Someone paid back the user → credit consumed
      balance -= split.paid_amount;
    }
  }

  return balance;
}

/**
 * Global balance across all groups for `currentUserId`.
 * Uses paid_amount on splits — no settlements needed.
 * Uses a greedy algorithm to simplify debts.
 */
export function computeGlobalBalance(
  expenses: ExpenseWithDetails[],
  currentUserId: string,
  allUserIds: string[]
): GlobalBalance {
  const netMap = new Map<string, number>();
  for (const uid of allUserIds) netMap.set(uid, 0);

  for (const expense of expenses) {
    if (expense.paid_by === null) continue; // pending expenses handled separately

    netMap.set(expense.paid_by, (netMap.get(expense.paid_by) ?? 0) + expense.amount);

    for (const split of expense.splits) {
      netMap.set(split.user_id, (netMap.get(split.user_id) ?? 0) - split.amount);

      if (split.user_id !== expense.paid_by && split.paid_amount > 0) {
        netMap.set(split.user_id, (netMap.get(split.user_id) ?? 0) + split.paid_amount);
        netMap.set(expense.paid_by, (netMap.get(expense.paid_by) ?? 0) - split.paid_amount);
      }
    }
  }

  const net = netMap.get(currentUserId) ?? 0;
  const debts = simplifyDebts(netMap);

  return { net, debts };
}

function simplifyDebts(netMap: Map<string, number>): Debt[] {
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, balance] of netMap) {
    if (balance > 0) creditors.push({ userId, amount: balance });
    else if (balance < 0) debtors.push({ userId, amount: -balance });
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const debts: Debt[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.amount, debtor.amount);

    if (amount > 0) {
      debts.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return debts;
}
