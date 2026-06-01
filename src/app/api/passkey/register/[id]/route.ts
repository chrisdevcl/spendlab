import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;
  const { nickname } = await request.json();
  const trimmed = typeof nickname === "string" ? nickname.trim().slice(0, 60) : null;

  const { error } = await supabase
    .from("passkey_credentials")
    .update({ nickname: trimmed || null })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Error al renombrar passkey" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { id } = await params;

  // Prevent deleting the last passkey
  const { count } = await supabase
    .from("passkey_credentials")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) <= 1) {
    return NextResponse.json(
      { error: "No puedes eliminar tu única passkey" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("passkey_credentials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Error al eliminar passkey" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
