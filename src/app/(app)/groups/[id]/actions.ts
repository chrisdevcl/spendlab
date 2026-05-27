"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSettlement as createSettlementService } from "@/lib/services/expenses.service";
import { inviteMember as inviteMemberService } from "@/lib/services/groups.service";

export async function createSettlement(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Dev mode: simulate success
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const settlement = await createSettlementService(groupId, paidBy, paidTo, amount);
  if (!settlement) return { error: "Error al registrar el pago. Intenta de nuevo." };

  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function inviteMemberToGroup(
  groupId: string,
  email: string
): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "El email no puede estar vacío" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return { error: "Email inválido" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const invitation = await inviteMemberService(groupId, trimmed, user.id);
  if (!invitation)
    return { error: "Error al enviar la invitación. Intenta de nuevo." };

  revalidatePath(`/groups/${groupId}`);
  return {};
}
