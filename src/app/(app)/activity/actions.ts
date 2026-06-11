"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registerGroupFullPayment } from "@/lib/services/expenses.service";
import { notifySettlementReceived } from "@/lib/services/notifications.service";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function createGlobalSettlement(
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const result = await registerGroupFullPayment(null, paidBy, paidTo || null, amount);
  if (result.error) return { error: result.error };

  if (result.applied > 0 && paidTo) {
    await notifySettlementReceived({ groupId: null, paidBy, paidTo, amount: result.applied });
  }

  revalidatePath("/activity");
  revalidatePath("/groups");
  return {};
}
