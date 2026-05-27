"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  createGroup as createGroupService,
  inviteMember as inviteMemberService,
} from "@/lib/services/groups.service";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

export async function createGroup(
  name: string
): Promise<{ groupId?: string; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "El nombre no puede estar vacío" };
  if (trimmed.length > 60) return { error: "El nombre es demasiado largo" };

  // In dev mode return a mock group so the UI can navigate to the detail stub
  if (DEV_MODE) return { groupId: "g1" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { group, error: svcErr } = await createGroupService(trimmed, user.id);
  if (!group) return { error: svcErr ?? "Error al crear el grupo. Intenta de nuevo." };

  revalidatePath("/groups");
  return { groupId: group.id };
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

  // Verify invitation is valid and belongs to this user's email
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  const { data: inv } = await supabase
    .from("group_invitations")
    .select("id, group_id, accepted_at, expires_at, invited_email")
    .eq("id", invitationId)
    .single();

  if (!inv) return { error: "Invitación no encontrada" };
  if (inv.accepted_at) return { error: "Invitación ya aceptada" };
  if (new Date(inv.expires_at) < new Date()) return { error: "Invitación expirada" };
  if (inv.invited_email !== profile?.email) return { error: "No autorizado" };

  // Add to group (ignore duplicate)
  const { error: memberErr } = await supabase
    .from("group_members")
    .insert({ group_id: inv.group_id, user_id: user.id });
  if (memberErr && memberErr.code !== "23505")
    return { error: "Error al unirse al grupo" };

  // Mark accepted
  await supabase
    .from("group_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitationId);

  revalidatePath("/groups");
  return {};
}

export async function rejectInvitation(
  invitationId: string
): Promise<{ error?: string }> {
  if (DEV_MODE) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .single();

  await supabase
    .from("group_invitations")
    .delete()
    .eq("id", invitationId)
    .eq("invited_email", profile?.email ?? "")
    .is("accepted_at", null);

  revalidatePath("/groups");
  return {};
}

export async function inviteMember(
  groupId: string,
  email: string
): Promise<{ error?: string }> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "El email no puede estar vacío" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    return { error: "Email inválido" };

  if (DEV_MODE) return {};

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
