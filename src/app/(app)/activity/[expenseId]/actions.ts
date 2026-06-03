"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createSettlement as createSettlementService,
  deleteExpense as deleteExpenseService,
  markExpenseAsPaid as markExpenseAsPaidService,
  recordSplitPayment as recordSplitPaymentService,
} from "@/lib/services/expenses.service";
import {
  notifySettlementReceived,
  notifyExpensePaid,
  notifySplitPayment,
} from "@/lib/services/notifications.service";

export async function createSettlementFromExpense(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const settlement = await createSettlementService(groupId, paidBy, paidTo, amount);
  if (!settlement) return { error: "Error al registrar el pago. Intenta de nuevo." };

  await notifySettlementReceived({ groupId, paidBy, paidTo, amount });

  revalidatePath("/activity");
  revalidatePath(`/activity/${paidBy}`); // optimistic; real expenseId not relevant here
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function recordSplitPayment(
  splitId: string,
  payAmount: number,
  expenseId: string,
  groupId: string
): Promise<{ error?: string }> {
  if (payAmount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const ok = await recordSplitPaymentService(splitId, payAmount);
  if (!ok) return { error: "Error al registrar el pago. Intenta de nuevo." };

  await notifySplitPayment({ expenseId, groupId, paidBy: user.id, amount: payAmount });

  revalidatePath(`/activity/${expenseId}`);
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function markExpenseAsPaid(
  expenseId: string,
  groupId: string,
  paidBy: string,
  description: string,
  amount: number
): Promise<{ error?: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const ok = await markExpenseAsPaidService(expenseId, paidBy);
  if (!ok) return { error: "Error al registrar el pago. Intenta de nuevo." };

  await notifyExpensePaid({ expenseId, groupId, paidBy, description, amount });

  revalidatePath("/activity");
  revalidatePath(`/activity/${expenseId}`);
  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function deleteExpense(
  expenseId: string,
  groupId: string
): Promise<{ error?: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const ok = await deleteExpenseService(expenseId);
  if (!ok) return { error: "Error al eliminar el gasto. Intenta de nuevo." };

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/activity");
  return {};
}
