"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function registerPayment(
  paidToUserId: string,
  amount: number
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
  });

  if (error) return { applied: 0, error: error.message };

  revalidatePath("/saldos");
  revalidatePath("/activity");
  return { applied: amount };
}
