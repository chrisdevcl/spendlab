"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  deleteExpense as deleteExpenseService,
  markExpenseAsPaid as markExpenseAsPaidService,
  recordSplitPayment as recordSplitPaymentService,
  updateExpense as updateExpenseService,
} from "@/lib/services/expenses.service";
import { getGroupMembers } from "@/lib/services/groups.service";
import {
  notifyExpensePaid,
  notifySplitPayment,
} from "@/lib/services/notifications.service";

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

export async function updateExpense(
  expenseId: string,
  groupId: string,
  paidBy: string | null,
  amount: number,
  description: string,
  memberIds: string[],
  date: string
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!description.trim()) return { error: "La descripción no puede estar vacía" };
  if (!memberIds.length) return { error: "Selecciona al menos un participante" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Fecha inválida" };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: expense, error: fErr } = await supabase
    .from("expenses")
    .select("id, group_id, created_by")
    .eq("id", expenseId)
    .single();

  if (fErr || !expense) return { error: "Gasto no encontrado" };
  if (expense.created_by !== user.id) return { error: "No tienes permiso para editar este gasto" };

  if (groupId !== expense.group_id) {
    const [oldMembers, newMembers] = await Promise.all([
      getGroupMembers(expense.group_id),
      getGroupMembers(groupId),
    ]);
    const oldIds = new Set((oldMembers ?? []).map((m) => m.id));
    const newIds = new Set((newMembers ?? []).map((m) => m.id));
    const sameMembers = oldIds.size === newIds.size && [...oldIds].every((id) => newIds.has(id));
    if (!sameMembers) return { error: "Solo puedes mover el gasto a un grupo con los mismos integrantes" };
  }

  const ok = await updateExpenseService(
    expenseId,
    groupId,
    paidBy,
    amount,
    description.trim(),
    memberIds,
    date
  );
  if (!ok) return { error: "Error al guardar los cambios. Intenta de nuevo." };

  revalidatePath(`/activity/${expenseId}`);
  revalidatePath("/activity");
  revalidatePath(`/groups/${groupId}`);
  if (groupId !== expense.group_id) revalidatePath(`/groups/${expense.group_id}`);

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
