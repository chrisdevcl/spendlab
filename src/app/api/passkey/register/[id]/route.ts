import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // Count remaining passkeys before deleting to prevent removing the last one
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
    .eq("user_id", user.id); // ensure ownership

  if (error) {
    return NextResponse.json({ error: "Error al eliminar passkey" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
