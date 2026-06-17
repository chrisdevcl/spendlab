"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  registerPendingPayment as servicePendingPayment,
} from "@/lib/services/expenses.service";
import { notifySettlementReceived } from "@/lib/services/notifications.service";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

function revalidate() {
  revalidatePath("/saldos");
  revalidatePath("/activity");
}

export async function registerPayment(
  paidToUserId: string,
  amount: number,
  note?: string
): Promise<{ applied: number; error?: string }> {
  if (DEV_MODE) return { applied: amount };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { applied: 0, error: "No autenticado" };

  const { error } = await supabase.from("settlements").insert({
    group_id: null,
    paid_by: user.id,
    paid_to: paidToUserId,
    amount,
    settled_at: new Date().toISOString(),
    ...(note?.trim() ? { note: note.trim() } : {}),
  });

  if (error) return { applied: 0, error: error.message };

  await notifySettlementReceived({ groupId: null, paidBy: user.id, paidTo: paidToUserId, amount, note });

  revalidate();
  return { applied: amount };
}

export async function registerPendingPaymentAction(
  amount: number
): Promise<{ applied: number; error?: string }> {
  if (DEV_MODE) return { applied: amount };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { applied: 0, error: "No autenticado" };

  const result = await servicePendingPayment(null, user.id, amount);
  if (!result.error) revalidate();
  return result;
}
