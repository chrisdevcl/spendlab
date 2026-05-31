"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createExpense as createExpenseService } from "@/lib/services/expenses.service";

export async function createExpense(
  groupId: string,
  paidBy: string,
  amount: number,
  description: string,
  memberIds: string[]
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (!description.trim()) return { error: "La descripción no puede estar vacía" };
  if (!memberIds.length) return { error: "Selecciona al menos un participante" };

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
    memberIds
  );
  if (!expense) return { error: "Error al guardar el gasto. Intenta de nuevo." };

  // Fire-and-forget push notification to other group members
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3741";
  fetch(`${appUrl}/api/push/expense`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupId, paidBy, description: description.trim(), amount }),
  }).catch((err) => console.error("[createExpense] push notification error:", err));

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
