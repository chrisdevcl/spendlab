"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createExpense as createExpenseService } from "@/lib/services/expenses.service";
import { notifyExpenseAdded } from "@/lib/services/notifications.service";

export async function createExpense(
  groupId: string,
  paidBy: string,
  amount: number,
  description: string,
  memberIds: string[],
  date?: string
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!description.trim()) return { error: "La descripción no puede estar vacía" };
  if (!memberIds.length) return { error: "Selecciona al menos un participante" };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Fecha inválida" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Dev mode: skip DB, just navigate back
    redirect(`/groups/${groupId}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const expense = await createExpenseService(
    groupId,
    paidBy,
    amount,
    description.trim(),
    memberIds,
    date
  );
  if (!expense) return { error: "Error al guardar el gasto. Intenta de nuevo." };

  // Send push notifications before redirect — awaited so serverless doesn't
  // kill the process before they're dispatched (redirect() throws internally).
  await notifyExpenseAdded({ expenseId: expense.id, groupId, paidBy, description: description.trim(), amount });

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
