"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateDisplayName(
  name: string
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "El nombre no puede estar vacío" };
  if (trimmed.length > 60) return { error: "El nombre es demasiado largo" };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // .select().single() hace que PostgREST falle con PGRST116 si la policy RLS
  // bloquea la fila silenciosamente (UPDATE sin .select() siempre devuelve
  // error=null aunque no haya actualizado ninguna fila).
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();

  if (error) return { error: `Error al actualizar el nombre: ${error.message}` };

  revalidatePath("/profile");
  return {};
}

export async function signOut(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/login");
  }

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteAccount(): Promise<{ error?: string }> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  // Delete profile row — cascade elimina grupos, gastos y miembros relacionados.
  const { error: profileErr } = await supabase
    .from("profiles")
    .delete()
    .eq("id", user.id)
    .select()
    .single();

  if (profileErr) {
    return { error: `Error al eliminar la cuenta: ${profileErr.message}` };
  }

  // Sign out and remove auth user (requires service role in production;
  // here we sign out and rely on the profile deletion having taken effect)
  await supabase.auth.signOut();
  redirect("/login");
}
