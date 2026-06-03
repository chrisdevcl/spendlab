import type { Expense, ExpenseSplit, Settlement } from "@/types/database.types";
import type { Debt, GlobalBalance } from "@/types";

/**
 * Net balance for `currentUserId` within a single group.
 * Positive = others owe you; negative = you owe others.
 */
export function computeGroupBalance(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  currentUserId: string
): number {
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
  }

  for (const settlement of settlements) {
    if (settlement.paid_by === currentUserId) {
      balance += settlement.amount;
    }
    if (settlement.paid_to === currentUserId) {
      balance -= settlement.amount;
    }
  }

  return balance;
}

/**
 * Global balance across all groups for `currentUserId`.
 * Uses a greedy algorithm to simplify debts: sort creditors and debtors by
 * absolute amount descending, then match them until all balances are zero.
 */
export function computeGlobalBalance(
  expenses: Expense[],
  splits: ExpenseSplit[],
  settlements: Settlement[],
  currentUserId: string,
  allUserIds: string[]
): GlobalBalance {
  // Build net balance map: positive = creditor, negative = debtor
  const netMap = new Map<string, number>();
  for (const uid of allUserIds) {
    netMap.set(uid, 0);
  }

  for (const expense of expenses) {
    if (expense.paid_by !== null) {
      netMap.set(expense.paid_by, (netMap.get(expense.paid_by) ?? 0) + expense.amount);
    }
  }

  for (const split of splits) {
    netMap.set(split.user_id, (netMap.get(split.user_id) ?? 0) - split.amount);
  }

  for (const settlement of settlements) {
    netMap.set(settlement.paid_by, (netMap.get(settlement.paid_by) ?? 0) + settlement.amount);
    netMap.set(settlement.paid_to, (netMap.get(settlement.paid_to) ?? 0) - settlement.amount);
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

  // Sort descending for greedy matching
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
      debts.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount,
      });
    }

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return debts;
}
