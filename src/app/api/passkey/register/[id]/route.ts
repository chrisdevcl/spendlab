import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// Helper: verify the session and return the user id, or null
async function getAuthenticatedUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const { nickname } = await request.json();
  const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 60) : null;

  // Use admin client to bypass RLS — ownership is enforced via the user_id filter
  const admin = createAdminClient();
  const { error, data } = await admin
    .from("passkey_credentials")
    .update({ nickname: trimmed || null })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    console.error("[PATCH passkey] db error:", error.message);
    return NextResponse.json({ error: "Error al renombrar passkey" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Passkey no encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  // Prevent deleting the last passkey
  const { count } = await admin
    .from("passkey_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "No puedes eliminar tu única passkey" },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("passkey_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[DELETE passkey] db error:", error.message);
    return NextResponse.json({ error: "Error al eliminar passkey" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
