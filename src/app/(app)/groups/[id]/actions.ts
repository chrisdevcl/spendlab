"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { registerGroupFullPayment } from "@/lib/services/expenses.service";
import {
  notifySettlementReceived,
  notifyInvitationAccepted,
  notifyInvitationRejected,
} from "@/lib/services/notifications.service";
import {
  inviteMember as inviteMemberService,
  deleteGroup as deleteGroupService,
  createGroup as createGroupService,
  updateGroup as updateGroupService,
} from "@/lib/services/groups.service";
import { sendInvitationEmail } from "@/lib/email/invitation";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function createSettlement(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number
): Promise<{ error?: string }> {
  if (amount <= 0) return { error: "El monto debe ser mayor a 0" };
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const result = await registerGroupFullPayment(groupId, paidBy, paidTo || null, amount);
  if (result.error) return { error: result.error };

  if (result.applied > 0 && paidTo) {
    await notifySettlementReceived({ groupId, paidBy, paidTo, amount: result.applied });
  }

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

  if (DEV_MODE) {
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

  // Send invitation email fire-and-forget — never block on email errors
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    // Fetch inviter display name and group name in parallel
    const [profileRes, groupRes] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase.from("groups").select("name").eq("id", groupId).single(),
    ]);

    const inviterName = profileRes.data?.display_name ?? user.email ?? "Alguien";
    const groupName   = groupRes.data?.name ?? "un grupo";

    sendInvitationEmail({ toEmail: trimmed, inviterName, groupName }).catch(
      (err) => console.error("[inviteMemberToGroup] email error:", err)
    );
  }

  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function deleteGroup(
  groupId: string
): Promise<{ error?: string }> {
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const ok = await deleteGroupService(groupId);
  if (!ok) return { error: "Error al eliminar el grupo. Intenta de nuevo." };

  revalidatePath("/groups");
  return {};
}

export async function renameGroup(
  groupId: string,
  name: string
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "El nombre no puede estar vacío" };
  if (trimmed.length > 60) return { error: "Máximo 60 caracteres" };

  if (DEV_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { error } = await updateGroupService(groupId, trimmed);
  if (error) return { error: "Error al renombrar el grupo. Intenta de nuevo." };

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/groups");
  return {};
}

export async function createGroup(
  name: string,
  _userId: string
): Promise<{ group?: { id: string } | null; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "El nombre no puede estar vacío" };

  if (DEV_MODE) return { group: { id: "g1" } };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { group, error: svcErr } = await createGroupService(trimmed, user.id);
  if (!group) return { error: svcErr ?? "Error al crear el grupo. Intenta de nuevo." };

  revalidatePath("/groups");
  return { group };
}

export async function acceptInvitation(
  invitationId: string
): Promise<{ error?: string }> {
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles").select("email").eq("id", user.id).single();

  const { data: inv } = await supabase
    .from("group_invitations")
    .select("id, group_id, accepted_at, expires_at, invited_email, invited_by")
    .eq("id", invitationId).single();

  if (!inv) return { error: "Invitación no encontrada" };
  if (inv.accepted_at) return { error: "Invitación ya aceptada" };
  if (new Date(inv.expires_at) < new Date()) return { error: "Invitación expirada" };
  if (inv.invited_email !== profile?.email) return { error: "No autorizado" };

  const { error: memberErr } = await supabase
    .from("group_members").insert({ group_id: inv.group_id, user_id: user.id });
  if (memberErr && memberErr.code !== "23505") return { error: "Error al unirse al grupo" };

  await supabase
    .from("group_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  notifyInvitationAccepted({
    groupId: inv.group_id,
    invitedBy: inv.invited_by,
    inviteeId: user.id,
  }).catch((err) => console.error("[acceptInvitation] notify error:", err));

  revalidatePath("/groups");
  return {};
}

export async function rejectInvitation(
  invitationId: string,
  groupId: string
): Promise<{ error?: string }> {
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles").select("email").eq("id", user.id).single();

  // Fetch invited_by before deleting so we can notify
  const { data: inv } = await supabase
    .from("group_invitations")
    .select("invited_by")
    .eq("group_id", groupId)
    .eq("invited_email", profile?.email ?? "")
    .is("accepted_at", null)
    .maybeSingle();

  await supabase
    .from("group_invitations")
    .delete()
    .eq("group_id", groupId)
    .eq("invited_email", profile?.email ?? "")
    .is("accepted_at", null);

  if (inv?.invited_by) {
    notifyInvitationRejected({
      groupId,
      invitedBy: inv.invited_by,
      inviteeId: user.id,
    }).catch((err) => console.error("[rejectInvitation] notify error:", err));
  }

  revalidatePath("/groups");
  return {};
}
