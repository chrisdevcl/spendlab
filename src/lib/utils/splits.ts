export interface Split {
  userId: string;
  amount: number;
}

/**
 * Divides `total` equally among `memberIds` using floor + remainder distribution.
 * The first N members (where N = total % memberIds.length) each receive one extra unit.
 * Guarantees: sum of all amounts === total.
 */
export function calculateEqualSplits(total: number, memberIds: string[]): Split[] {
  if (memberIds.length === 0) return [];

  const base = Math.floor(total / memberIds.length);
  const remainder = total % memberIds.length;

  return memberIds.map((userId, index) => ({
    userId,
    amount: base + (index < remainder ? 1 : 0),
  }));
}
