/**
 * POST /api/push/test
 *
 * Sends a sample "expense added" notification to the current user so they can
 * preview how a real expense notification looks.
 */
import { createClient } from "@/lib/supabase/server";
import { notifyTestExpense } from "@/lib/services/notifications.service";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { sent, total } = await notifyTestExpense(user.id);

  if (total === 0) {
    return NextResponse.json(
      { error: "No tienes suscripciones guardadas. Activa las notificaciones primero." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: sent > 0, sent, total });
}
